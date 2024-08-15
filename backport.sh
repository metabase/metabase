git reset HEAD~1
rm ./backport.sh
git cherry-pick 10ecdd7ccf1d1c3fa7aa50349242f40f332db0d6
echo 'Resolve conflicts and force push this branch'
