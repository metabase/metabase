git reset HEAD~1
rm ./backport.sh
git cherry-pick 9e191a48e632cb11dd80c8dbc5dc08e90554bd74
echo 'Resolve conflicts and force push this branch'
