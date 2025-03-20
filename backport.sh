git reset HEAD~1
rm ./backport.sh
git cherry-pick 8d82cbafd6aa4b03775567083571df5e8b8a1c25
echo 'Resolve conflicts and force push this branch'
