git reset HEAD~1
rm ./backport.sh
git cherry-pick 37ec722486ddb9b4669b647377ffb4efaa2b6546
echo 'Resolve conflicts and force push this branch'
