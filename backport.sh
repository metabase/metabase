git reset HEAD~1
rm ./backport.sh
git cherry-pick 1316be26cd14e8febd1d74b13b5767ac60b3f50c
echo 'Resolve conflicts and force push this branch'
