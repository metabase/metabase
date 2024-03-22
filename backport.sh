git reset HEAD~1
rm ./backport.sh
git cherry-pick 1409c7bdf442a8d686d2f92c0962bfef6680f5f8
echo 'Resolve conflicts and force push this branch'
