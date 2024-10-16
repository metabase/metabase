git reset HEAD~1
rm ./backport.sh
git cherry-pick 31622ad3b31f5ae8c9e56437376e1f1cffd5b935
echo 'Resolve conflicts and force push this branch'
