git reset HEAD~1
rm ./backport.sh
git cherry-pick 46df39bffc3967743e44c117fe12691cbac7694a
echo 'Resolve conflicts and force push this branch'
