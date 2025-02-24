git reset HEAD~1
rm ./backport.sh
git cherry-pick 231e16b87671f38b71ae8bd2b9cbe43283fbda86
echo 'Resolve conflicts and force push this branch'
