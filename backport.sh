git reset HEAD~1
rm ./backport.sh
git cherry-pick 106ee4f4ef7abe2e2d2c481f6b779faebaff64b3
echo 'Resolve conflicts and force push this branch'
