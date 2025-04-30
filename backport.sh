git reset HEAD~1
rm ./backport.sh
git cherry-pick 5fabb3e1ec75cb567815c230c3a874a35027a029
echo 'Resolve conflicts and force push this branch'
