git reset HEAD~1
rm ./backport.sh
git cherry-pick 82e95749fd07d94263dc71b8bdc6730615e3ae16
echo 'Resolve conflicts and force push this branch'
