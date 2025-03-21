git reset HEAD~1
rm ./backport.sh
git cherry-pick da12a8741da819dc6c9fe142e87c9cf4e3460995
echo 'Resolve conflicts and force push this branch'
