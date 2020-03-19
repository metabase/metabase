tell application "Finder"
  tell disk "Metabase"
    open
    set current view of container window to icon view
    set toolbar visible of container window to false
    set statusbar visible of container window to false
    set the bounds of container window to {400, 100, 885, 430}
    set theViewOptions to the icon view options of container window
    set arrangement of theViewOptions to not arranged
    set icon size of theViewOptions to 72
    make new alias file at container window to POSIX file "/Applications" with properties {name:"Applications"}
    set position of item "Metabase.app" of container window to {100, 100}
    set position of item "Applications" of container window to {375, 100}
    update without registering applications
    delay 5
    close
  end tell
end tell
