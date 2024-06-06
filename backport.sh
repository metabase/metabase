git reset HEAD~1
rm ./backport.sh
git cherry-pick 8eeacc60c422c3db130dbe6c115b675627d4e4b2
echo 'Resolve conflicts and force push this branch'
