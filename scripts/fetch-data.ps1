# scripts/fetch-data.ps1
# Fetch lottery draw history using PowerShell Windows TLS stack (bypasses WAF)
# Run in GitHub Actions (windows-latest) with: shell: pwsh

$ErrorActionPreference = "Stop"

New-Item -ItemType Directory -Force -Path "data" | Out-Null

$baseHeaders = @{
    "User-Agent"      = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    "Accept"          = "application/json, text/plain, */*"
    "Accept-Language" = "zh-CN,zh;q=0.9,en;q=0.8"
}

# ====== SSQ ======
Write-Host "[SSQ] Fetching SSQ data..."
try {
    $h = $baseHeaders.Clone()
    $h["Referer"] = "https://www.cwl.gov.cn/"
    $ssqUrl = "https://www.cwl.gov.cn/cwl_admin/front/cwlkj/search/kjxx/findDrawNotice?name=ssq&issueCount=500"
    $r    = Invoke-WebRequest $ssqUrl -Headers $h -TimeoutSec 30 -UseBasicParsing
    $json = $r.Content | ConvertFrom-Json
    if ($json.state -ne 0) { throw "API state=$($json.state) msg=$($json.message)" }

    $draws = @()
    foreach ($x in $json.result) {
        $draws += [PSCustomObject]@{
            code = [string]$x.code
            date = $x.date
            red  = $x.red.Split(',') | ForEach-Object { [int]$_ }
            blue = @([int]$x.blue)
        }
    }
    $updatedAt = [int64]([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
    [PSCustomObject]@{ draws = $draws; updatedAt = $updatedAt } |
        ConvertTo-Json -Depth 5 -Compress |
        Set-Content "data/ssq.json" -Encoding UTF8
    Write-Host "[SSQ] OK - $($draws.Count) draws saved"
} catch {
    Write-Host "[SSQ] FAILED: $($_.Exception.Message)"
    exit 1
}

# ====== DLT ======
Write-Host "[DLT] Fetching DLT data..."
try {
    $h = $baseHeaders.Clone()
    $h["Referer"] = "https://www.sporttery.cn/"
    $allDraws = @()
    $seen = @{}
    for ($page = 1; $page -le 5; $page++) {
        Write-Host "  Page ${page}..."
        $dltUrl = "https://webapi.sporttery.cn/gateway/lottery/getHistoryPageListV1.qry?gameNo=85&provinceId=0&pageSize=100&isVerify=1&pageNo=${page}"
        $r    = Invoke-WebRequest $dltUrl -Headers $h -TimeoutSec 30 -UseBasicParsing
        $json = $r.Content | ConvertFrom-Json
        if (-not $json.success -or $json.errorCode -ne "0") {
            Write-Host "  Page ${page}: errorCode=$($json.errorCode) msg=$($json.errorMessage)"
            break
        }
        $list = $json.value.list
        if (-not $list -or $list.Count -eq 0) { break }
        foreach ($x in $list) {
            $code = [string]$x.lotteryDrawNum
            if ($seen.ContainsKey($code)) { continue }
            $seen[$code] = $true
            $parts = $x.lotteryDrawResult.Trim() -split '\s+' | ForEach-Object { [int]$_ }
            $allDraws += [PSCustomObject]@{
                code = $code
                date = $x.lotteryDrawTime
                red  = $parts[0..4]
                blue = $parts[5..6]
            }
        }
    }
    $updatedAt = [int64]([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
    [PSCustomObject]@{ draws = $allDraws; updatedAt = $updatedAt } |
        ConvertTo-Json -Depth 5 -Compress |
        Set-Content "data/dlt.json" -Encoding UTF8
    Write-Host "[DLT] OK - $($allDraws.Count) draws saved"
} catch {
    Write-Host "[DLT] FAILED: $($_.Exception.Message)"
    exit 1
}

Write-Host "[KL8] Fetching KL8 (快乐8) data..."
try {
    $h = $baseHeaders.Clone()
    $h["Referer"] = "https://www.cwl.gov.cn/"
    $k8Url = "https://www.cwl.gov.cn/cwl_admin/front/cwlkj/search/kjxx/findDrawNotice?name=kl8&issueCount=300"
    $r    = Invoke-WebRequest $k8Url -Headers $h -TimeoutSec 30 -UseBasicParsing
    $json = $r.Content | ConvertFrom-Json
    if ($json.state -ne 0) { throw "API state=$($json.state) msg=$($json.message)" }

    $draws = @()
    foreach ($x in $json.result) {
        $draws += [PSCustomObject]@{
            code = [string]$x.code
            date = $x.date
            red  = $x.red.Split(',') | ForEach-Object { [int]$_ }
        }
    }
    $updatedAt = [int64]([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
    [PSCustomObject]@{ draws = $draws; updatedAt = $updatedAt } |
        ConvertTo-Json -Depth 5 -Compress |
        Set-Content "data/k8.json" -Encoding UTF8
    Write-Host "[KL8] OK - $($draws.Count) draws saved"
} catch {
    Write-Host "[KL8] FAILED: $($_.Exception.Message)"
    exit 1
}

Write-Host "Done!"
