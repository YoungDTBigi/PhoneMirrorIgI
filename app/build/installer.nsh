; Reguły zapory Windows dla silnika AirPlay (iPhone musi móc połączyć się z komputerem).
!macro customInstall
  nsExec::Exec 'netsh advfirewall firewall delete rule name="PhoneMirror AirPlay"'
  nsExec::Exec 'netsh advfirewall firewall add rule name="PhoneMirror AirPlay" dir=in action=allow program="$INSTDIR\resources\engine\bin\uxplay.exe" protocol=TCP profile=private,domain enable=yes'
  nsExec::Exec 'netsh advfirewall firewall add rule name="PhoneMirror AirPlay" dir=in action=allow program="$INSTDIR\resources\engine\bin\uxplay.exe" protocol=UDP profile=private,domain enable=yes'
!macroend

!macro customUnInstall
  nsExec::Exec 'netsh advfirewall firewall delete rule name="PhoneMirror AirPlay"'
!macroend
