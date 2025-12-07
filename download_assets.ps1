$ErrorActionPreference = "Stop"

# Map of local filenames to Wikimedia Commons filenames
$assets = @{
    "m1_abrams.jpg"   = "M1_Abrams_with_TUSK.jpg"
    "t90.jpg"         = "T-90M_Demonstration.jpg"
    "leopard2.jpg"    = "Leopard_2_A7_tank.jpg"
    "challenger2.jpg" = "Challenger_2_Main_Battle_Tank_patrolling_outside_Basra_MOD_45148325.jpg"
    "merkava4.jpg"    = "Merkava_Mk_4M_windbreaker.jpg"
    "f35.jpg"         = "F-35A_flight_(cropped).jpg"
    "gripen.jpg"      = "Saab_JAS_39_Gripen_at_Kaivopuisto_Air_Show,_June_2017_(J2).jpg"
    "bayraktar.jpg"   = "Bayraktar_TB2_Runway.jpg"
    "s400.jpg"        = "S-400_Triumf_SAM_at_Ashuluk_training_ground.jpg"
    "caesar.jpg"      = "Caesar_firing_Afghanistan.jpg"
}

$baseUrl = "https://commons.wikimedia.org/wiki/Special:FilePath/"

# Ensure assets dir exists
New-Item -ItemType Directory -Force -Path "assets" | Out-Null

foreach ($key in $assets.Keys) {
    try {
        $wkFile = $assets[$key]
        $encodedFile = [Uri]::EscapeDataString($wkFile)
        # Fix: Special:FilePath requires spaces to be underscores? Actually encodeURIComponent generally works.
        # But commonly wikimedia uses underscores.
        $encodedFile = $encodedFile.Replace("%20", "_")
        
        $url = "$baseUrl$encodedFile?width=800" # request 800px width version if supported, though FilePath might give raw.
        # FilePath usually redirects to proper file.
        
        Write-Host "Downloading $key from $wkFile ..."
        
        # UserAgent is critical for Wikimedia
        Invoke-WebRequest -Uri $url -OutFile "assets/$key" -UserAgent "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" -MaximumRedirection 5
        
        Write-Host "Success."
    } catch {
        Write-Warning "Failed to download $key : $_"
    }
}
