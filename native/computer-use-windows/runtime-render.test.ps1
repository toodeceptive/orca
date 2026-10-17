$ErrorActionPreference = "Stop"

function Assert-TestEqual($Actual, $Expected, [string]$Label) {
    if ($Actual -ne $Expected) {
        throw "$Label expected '$Expected', received '$Actual'"
    }
}

function Assert-TestThrows([scriptblock]$Action, [string]$Prefix, [string]$Label) {
    try { & $Action } catch {
        if ($_.Exception.Message.StartsWith($Prefix)) { return }
        throw "$Label received unexpected error: $($_.Exception.Message)"
    }
    throw "$Label did not reject the target"
}

Add-Type -TypeDefinition @"
using System.Collections;
using System.Collections.Generic;

public sealed class OrcaRenderTestCounter {
    public int FindAll;
}

public sealed class OrcaRenderTestBounds {
    public bool IsEmpty = true;
    public double X;
    public double Y;
    public double Width;
    public double Height;
}

public sealed class OrcaRenderTestControlType {
    public string ProgrammaticName = "";
}

public sealed class OrcaRenderTestCurrent {
    public string AutomationId = "";
    public OrcaRenderTestBounds BoundingRectangle = new OrcaRenderTestBounds();
    public string ClassName = "fake";
    public OrcaRenderTestControlType ControlType = new OrcaRenderTestControlType();
    public bool IsPassword;
    public string LocalizedControlType = "";
    public string Name = "";
    public long NativeWindowHandle;
}

public sealed class OrcaRenderTestPatternCurrent {
    public bool IsSelected;
    public string Value = "";
}

public sealed class OrcaRenderTestPattern {
    public OrcaRenderTestPatternCurrent Current = new OrcaRenderTestPatternCurrent();
}

public sealed class OrcaRenderTestCollection : IEnumerable {
    private readonly OrcaRenderTestElement[] values;

    public OrcaRenderTestCollection(OrcaRenderTestElement[] values) {
        this.values = values;
    }

    public int Count {
        get { return values.Length; }
    }

    public OrcaRenderTestElement Item(int index) {
        return values[index];
    }

    public IEnumerator GetEnumerator() {
        return values.GetEnumerator();
    }
}

public sealed class OrcaRenderTestElement {
    public readonly List<OrcaRenderTestElement> Children =
        new List<OrcaRenderTestElement>();
    public OrcaRenderTestCounter Counter = new OrcaRenderTestCounter();
    public readonly OrcaRenderTestCurrent Current = new OrcaRenderTestCurrent();
    public bool FailFindAll;
    public int RuntimeIdValue;
    public string ValueText = "";

    public OrcaRenderTestCollection FindAll(object scope, object condition) {
        Counter.FindAll++;
        if (FailFindAll) {
            throw new System.InvalidOperationException("defunct node");
        }
        return new OrcaRenderTestCollection(Children.ToArray());
    }

    public OrcaRenderTestPattern GetCurrentPattern(object pattern) {
        OrcaRenderTestPattern result = new OrcaRenderTestPattern();
        result.Current.Value = ValueText;
        return result;
    }

    public int[] GetRuntimeId() {
        return new int[] { RuntimeIdValue };
    }

    public object[] GetSupportedPatterns() {
        return new object[0];
    }
}
"@

function New-TestCounter {
    New-Object -TypeName OrcaRenderTestCounter
}

function New-TestElement {
    param(
        [string]$Role,
        [string]$Name = "",
        [string]$Value = "",
        [object[]]$Children = @(),
        $Counter = $(New-TestCounter),
        [switch]$FailFindAll,
        [int]$RuntimeId = 1
    )
    $element = New-Object -TypeName OrcaRenderTestElement
    $element.Counter = $Counter
    $element.FailFindAll = [bool]$FailFindAll
    $element.RuntimeIdValue = $RuntimeId
    $element.ValueText = $Value
    $element.Current.ControlType.ProgrammaticName = $Role
    $element.Current.LocalizedControlType = $Role
    $element.Current.Name = $Name
    foreach ($child in @($Children)) {
        [void]$element.Children.Add($child)
    }
    $element
}

$operationPath = Join-Path ([IO.Path]::GetTempPath()) ("orca-runtime-render-test-" + [guid]::NewGuid() + ".json")
try {
    Set-Content -LiteralPath $operationPath -Encoding UTF8 -Value '{"tool":"handshake"}'
    $runtimeOutput = . (Join-Path $PSScriptRoot "runtime.ps1") -OperationPath $operationPath
    $handshake = $runtimeOutput | ConvertFrom-Json
    Assert-TestEqual $handshake.ok $true "runtime handshake"
    $nativeRestoreWindow = ${function:Restore-OrcaWindow}
    $nativeRootElement = ${function:Get-OrcaRootElement}

    & {
        $script:testProcesses = @([pscustomobject]@{
            Id = 42; ProcessName = "chrome"; MainWindowHandle = 100; MainWindowTitle = "Primary"
        })
        $script:testWindows = @(
            [pscustomobject]@{ Handle = 200; ProcessId = 42; Title = "Secondary"; IsMinimized = $true },
            [pscustomobject]@{ Handle = 100; ProcessId = 42; Title = "Primary"; IsMinimized = $false }
        )
        function Get-OrcaProcessTable { $script:testProcesses }
        function Get-OrcaNativeWindows { $script:testWindows }
        $script:testStates = @{}
        foreach ($window in $script:testWindows) { $script:testStates[[int64]$window.Handle] = $window }
        $script:testCalls = New-Object 'System.Collections.Generic.List[string]'
        function Get-OrcaNativeWindowState([int64]$Handle) { $script:testStates[$Handle] }
        function Get-OrcaRootElement($Target) {
            $script:testCalls.Add("root:$($Target.handle)")
            $Target
        }
        function Get-OrcaWindowFrame($Target, $Root) {
            $script:testCalls.Add("frame:$($Target.handle)")
            New-OrcaFrame $Target.handle 20 300 400
        }
        function Restore-OrcaWindow($Target) {
            $script:testCalls.Add("restore:$($Target.handle)")
        }
        function Render-OrcaTree($Root, $Frame, $Compact) {
            $script:testCalls.Add("tree:$($Root.handle)")
            [pscustomobject]@{ elements = @(); lines = @(); truncation = $null }
        }
        function Get-OrcaScreenshot($Include, $Frame) {
            $script:testCalls.Add("screenshot:$($Frame.x)")
            $null
        }
        function Find-OrcaElement($Root, $Record) { $null }
        function Assert-OrcaKeyboardFocus($Handle, $Operation) {
            $script:testCalls.Add("focus:$Handle")
        }
        function Send-OrcaText($Handle, $Text) {
            $script:testCalls.Add("input:$Handle")
            if ($script:testCloseOnInput) {
                $script:testWindows = @($script:testWindows | Where-Object { $_.Handle -ne $Handle.ToInt64() })
                $script:testStates.Remove($Handle.ToInt64())
            }
        }
        $list = Get-OrcaWindowList "pid:42"
        Assert-TestEqual $list.windows.Count 2 "two windows for one process"
        Assert-TestEqual (($list.windows | ForEach-Object { $_.id }) -join "|") "100|200" "deterministic HWND ordering"
        Assert-TestEqual (($list.windows | ForEach-Object { $_.index }) -join "|") "0|1" "per-process window indices"
        Assert-TestEqual $list.windows[1].isMinimized $true "minimized secondary window"
        Assert-TestEqual $list.windows[1].isOffscreen $true "minimized window offscreen status"
        Assert-TestEqual (($script:testCalls) -join "|") "frame:100|frame:200" "window listing does not read UIA or restore"
        Assert-TestEqual (@(Get-OrcaAppList).Count) 1 "app deduplication"
        Assert-TestEqual (Find-OrcaProcess "Secondary").Id 42 "secondary title lookup"
        Assert-TestEqual (Find-OrcaWindowTarget "pid:42" $null 1).handle 200 "window index selection"
        Assert-TestEqual (Find-OrcaWindowTarget "pid:42" $null $null).handle 100 "default main window preference"
        Assert-TestEqual (Find-OrcaWindowTarget "pid:42" 200 $null).handle 200 "secondary HWND selection"

        $script:testCalls.Clear()
        $snapshot = New-OrcaSnapshot "pid:42" $true 200 $null $true
        Assert-TestEqual $snapshot.windowId 200 "snapshot selected HWND"
        Assert-TestEqual $snapshot.windowTitle "Secondary" "snapshot selected title"
        Assert-TestEqual $snapshot.windowIndex 1 "snapshot selected index"
        Assert-TestEqual (($script:testCalls) -join "|") "restore:200|root:200|frame:200|tree:200|screenshot:200" "selected target read and restore propagation"

        $operation = [pscustomobject]@{
            tool = "type_text"; app = "pid:42"; windowId = 200; windowIndex = $null
            restoreWindow = $true; noScreenshot = $true; text = "test"
        }
        $script:testCalls.Clear()
        $script:testCloseOnInput = $false
        $response = Invoke-OrcaOperation $operation
        Assert-TestEqual $response.snapshot.windowId 200 "action follow-up selected HWND"
        Assert-TestEqual (($script:testCalls) -join "|") "restore:200|root:200|frame:200|focus:200|input:200|root:200|frame:200|tree:200|screenshot:200" "selected target input propagation"

        $script:testCalls.Clear()
        Assert-TestThrows { New-OrcaSnapshot "pid:42" $false 999 $null $true } 'windowNotFound(' "foreign HWND"
        Assert-TestThrows { New-OrcaSnapshot "pid:42" $false 200 0 $true } 'windowNotFound(' "inconsistent HWND and index"
        Assert-TestThrows { New-OrcaSnapshot "pid:42" $false $null -1 $true } 'windowNotFound(' "negative index"
        $script:testStates[200L] = [pscustomobject]@{ Handle = 200; ProcessId = 99; Title = "Foreign" }
        Assert-TestThrows { New-OrcaSnapshot "pid:42" $false 200 $null $true } 'windowNotFound(' "reassigned HWND before restore"
        $staleTarget = [pscustomobject]@{ process = $script:testProcesses[0]; handle = 200 }
        Assert-TestThrows { & $nativeRestoreWindow $staleTarget } 'windowNotFound(' "native restore validates ownership"
        Assert-TestThrows { & $nativeRootElement $staleTarget } 'windowNotFound(' "native UIA root validates ownership"
        $script:testStates.Remove(200L)
        Assert-TestThrows { Invoke-OrcaOperation $operation } 'windowNotFound(' "closed HWND before action"
        Assert-TestEqual $script:testCalls.Count 0 "invalid targets rejected before reads, restore or input"

        $script:testStates[200L] = $script:testWindows[0]
        $script:testStates[200L].Title = "Bitwarden"
        Assert-TestThrows { New-OrcaSnapshot "pid:42" $false 200 $null $true } 'appBlocked(' "blocked secondary title"
        Assert-TestEqual $script:testCalls.Count 0 "blocked target rejected before restore"
        $script:testStates[200L].Title = "Secondary"

        $script:testProcesses[0].MainWindowHandle = 0
        Assert-TestEqual (Find-OrcaWindowTarget "pid:42" $null $null).handle 100 "window owner without process main window"
        $script:testCalls.Clear()
        $script:testCloseOnInput = $true
        $response = Invoke-OrcaOperation $operation
        Assert-TestEqual ($null -eq $response.snapshot) $true "closed selected target has no replacement snapshot"
        Assert-TestEqual $response.action.verification.reason "window_changed" "closed selected target invalidates cached window"
        Assert-TestEqual (($script:testCalls) -join "|") "restore:200|root:200|frame:200|focus:200|input:200" "closed target never redirects to primary window"
        Write-Output "windows-multiwindow-target-tests-ok"
    }

    $counter = New-TestCounter
    $leaf = New-TestElement -Role "text" -Name "unused" -Counter $counter -RuntimeId 2
    $root = New-TestElement -Role "button" -Name "Save" -Children @($leaf) -Counter $counter
    $tree = Render-OrcaTree $root $null
    Assert-TestEqual $tree.elements.Count 1 "named control record count"
    Assert-TestEqual ([string]$tree.lines[0]) "0 button Save" "named control line"
    Assert-TestEqual $counter.findAll 1 "named control child enumeration"

    $counter = New-TestCounter
    $leaf = New-TestElement -Role "text" -Name "body" -Counter $counter -RuntimeId 2
    $root = New-TestElement -Role "group" -Name "Details" -Children @($leaf) -Counter $counter
    $tree = Render-OrcaTree $root $null
    Assert-TestEqual (($tree.elements | ForEach-Object { $_.name }) -join "|") "Details|body" "named generic records"
    Assert-TestEqual (@($tree.lines) -join "|") "0 group Details|`t1 text body" "named generic lines"
    Assert-TestEqual $counter.findAll 2 "named generic child enumeration"

    $counter = New-TestCounter
    $alpha = New-TestElement -Role "text" -Name "Alpha" -Counter $counter -RuntimeId 2
    $beta = New-TestElement -Role "text" -Name "Beta" -Counter $counter -RuntimeId 3
    $root = New-TestElement -Role "group" -Children @($alpha, $beta) -Counter $counter
    $tree = Render-OrcaTree $root $null
    Assert-TestEqual $tree.elements.Count 1 "anonymous generic record count"
    Assert-TestEqual ([string]$tree.lines[0]) "0 group, Text: Alpha Beta" "anonymous generic summary"
    Assert-TestEqual $counter.findAll 7 "anonymous generic child enumeration"

    $counter = New-TestCounter
    $alpha = New-TestElement -Role "text" -Name "Alpha" -Counter $counter -RuntimeId 2
    $beta = New-TestElement -Role "text" -Name "Beta" -Counter $counter -RuntimeId 3
    $root = New-TestElement -Role "row" -Name "Invoice" -Children @($alpha, $beta) -Counter $counter
    $tree = Render-OrcaTree $root $null
    Assert-TestEqual (($tree.elements | ForEach-Object { $_.name }) -join "|") "Invoice|Alpha|Beta" "row records"
    Assert-TestEqual ([string]$tree.lines[0]) "0 row Invoice, Text: Alpha Beta" "row summary"
    Assert-TestEqual $counter.findAll 6 "row child enumeration"

    $counter = New-TestCounter
    $button = New-TestElement -Role "button" -Name "Continue" -Counter $counter -RuntimeId 2
    $root = New-TestElement -Role "group" -Children @($button) -Counter $counter
    $tree = Render-OrcaTree $root $null
    Assert-TestEqual $tree.elements.Count 1 "elided wrapper record count"
    Assert-TestEqual ([string]$tree.lines[0]) "0 button Continue" "elided wrapper line"
    Assert-TestEqual $counter.findAll 4 "elided wrapper child enumeration"

    $counter = New-TestCounter
    $root = New-TestElement -Role "row" -Name "Invoice" -Counter $counter -FailFindAll
    $tree = Render-OrcaTree $root $null
    Assert-TestEqual $tree.elements.Count 1 "failed child read record count"
    Assert-TestEqual ([string]$tree.lines[0]) "0 row Invoice" "failed child read line"
    Assert-TestEqual $counter.findAll 2 "failed child read retries"

    $originalMaxNodes = $MaxNodes
    try {
        $MaxNodes = 3
        $counter = New-TestCounter
        $children = @()
        for ($index = 0; $index -lt 3; $index++) {
            $children += New-TestElement -Role "text" -Name "Item $index" -Counter $counter -RuntimeId ($index + 2)
        }
        $root = New-TestElement -Role "document" -Name "Results" -Children $children -Counter $counter
        $tree = Render-OrcaTree $root $null
        Assert-TestEqual $tree.elements.Count 3 "node limit record count"
        Assert-TestEqual ([string]$tree.elements[-1].name) "Item 1" "node limit prefix"
        Assert-TestEqual $tree.truncation.truncated $true "node limit truncation"
        Assert-TestEqual $tree.truncation.maxDepthReached $false "node limit depth flag"
    } finally {
        $MaxNodes = $originalMaxNodes
    }

    $originalMaxDepth = $MaxDepth
    try {
        $MaxDepth = 2
        $counter = New-TestCounter
        $root = New-TestElement -Role "document" -Name "Depth 3" -Counter $counter -RuntimeId 4
        for ($depth = 2; $depth -ge 0; $depth--) {
            $root = New-TestElement -Role "document" -Name "Depth $depth" -Children @($root) -Counter $counter -RuntimeId ($depth + 1)
        }
        $tree = Render-OrcaTree $root $null
        Assert-TestEqual $tree.elements.Count 3 "depth limit record count"
        Assert-TestEqual ([string]$tree.elements[-1].name) "Depth 2" "depth limit prefix"
        Assert-TestEqual $tree.truncation.truncated $true "depth limit truncation"
        Assert-TestEqual $tree.truncation.maxDepthReached $true "depth limit flag"
    } finally {
        $MaxDepth = $originalMaxDepth
    }

    Write-Output "windows-snapshot-render-tests-ok"
} finally {
    Remove-Item -LiteralPath $operationPath -Force -ErrorAction SilentlyContinue
}
