git reset HEAD~1
rm ./backport.sh
git cherry-pick 8f425c9fee165bd3c5f4ad0e2b23a4bd6e7398e5
echo 'Resolve conflicts and force push this branch'
