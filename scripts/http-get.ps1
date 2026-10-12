param([Parameter(Mandatory=$true)][string]$Uri)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$response = Invoke-WebRequest -Uri $Uri -TimeoutSec 20 -UseBasicParsing
if ($response.RawContentLength -gt 4194304) { throw 'Response exceeds 4 MiB' }
$bytes = $response.RawContentStream.ToArray()
[Console]::Write([System.Text.Encoding]::UTF8.GetString($bytes))
