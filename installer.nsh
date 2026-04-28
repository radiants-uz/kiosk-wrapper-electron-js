; This NSIS hook runs during install and uninstall (including auto-updates).
; It force-closes any running instance of the kiosk so the installer can
; replace the .exe on disk. Without this, an update to a running kiosk would
; fail with "file in use" and silently roll back.
;
; The exe name MUST match `productName` in package.json (with .exe appended).

!macro customInit
  DetailPrint "Checking for running instances of Iccu Platform..."

  ; Try graceful close first
  nsExec::Exec 'taskkill /IM "Iccu Platform.exe" /T'
  Sleep 2000

  ; Force close if still running
  nsExec::Exec 'taskkill /F /IM "Iccu Platform.exe" /T'
  Sleep 2000

  ; Kill any orphaned helper processes
  nsExec::Exec 'taskkill /F /IM "Iccu Platform.exe" /T'
  Sleep 1000

  DetailPrint "Processes closed. Ready to install..."
!macroend

!macro customInstall
  ; Additional custom install steps can go here
!macroend

!macro customUnInit
  DetailPrint "Closing Iccu Platform before uninstall..."

  nsExec::Exec 'taskkill /F /IM "Iccu Platform.exe" /T'
  Sleep 1000

  DetailPrint "Ready to uninstall..."
!macroend
