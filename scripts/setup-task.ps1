# 注册"彩票数据库每日更新"Windows 定时任务
# 每天 22:30 自动运行 update-data.py
# 以管理员身份运行此脚本

$TaskName    = "LotteryDataUpdate"
$ScriptPath  = Split-Path -Parent $MyInvocation.MyCommand.Path
$PythonExe   = (Get-Command python -ErrorAction SilentlyContinue).Source
$UpdateScript = Join-Path $ScriptPath "update-data.py"

if (-not $PythonExe) {
    Write-Host "❌ 未找到 python，请确认 Python 已加入 PATH" -ForegroundColor Red
    exit 1
}

Write-Host "Python:  $PythonExe"
Write-Host "脚本:    $UpdateScript"

# 删除旧任务（如存在）
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "旧任务已删除"
}

# 触发器：每天 22:30
$trigger = New-ScheduledTaskTrigger -Daily -At "22:30"

# 操作：python update-data.py
$action = New-ScheduledTaskAction `
    -Execute $PythonExe `
    -Argument "`"$UpdateScript`"" `
    -WorkingDirectory $ScriptPath

# 设置：允许在使用电池时运行，最长运行 2 小时，如失败每 10 分钟重试一次（最多 3 次）
$settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Hours 2) `
    -RestartInterval (New-TimeSpan -Minutes 10) `
    -RestartCount 3 `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable

# 以当前用户身份运行（无需密码弹窗）
$principal = New-ScheduledTaskPrincipal `
    -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) `
    -LogonType Interactive `
    -RunLevel Limited

Register-ScheduledTask `
    -TaskName $TaskName `
    -Trigger   $trigger `
    -Action    $action `
    -Settings  $settings `
    -Principal $principal `
    -Description "每天22:30自动更新双色球/大乐透/快乐8开奖数据库" | Out-Null

Write-Host ""
Write-Host "✅ 定时任务已注册" -ForegroundColor Green
Write-Host "   任务名称: $TaskName"
Write-Host "   执行时间: 每天 22:30"
Write-Host "   Python:   $PythonExe"
Write-Host "   脚本:     $UpdateScript"
Write-Host ""
Write-Host "可在「任务计划程序」中查看和管理该任务。"
Write-Host "手动立即运行: Start-ScheduledTask -TaskName '$TaskName'"
