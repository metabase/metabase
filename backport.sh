git reset HEAD~1
rm ./backport.sh
git cherry-pick ffbad1d6ae2d56f634102f90a8d77a129765b004
echo 'Resolve conflicts and force push this branch'
