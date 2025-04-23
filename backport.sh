git reset HEAD~1
rm ./backport.sh
git cherry-pick 520c64839c4303842f7a9ebf526373024a6d9eaa
echo 'Resolve conflicts and force push this branch'
