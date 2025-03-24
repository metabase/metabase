git reset HEAD~1
rm ./backport.sh
git cherry-pick 7eee9af1824f68cdcb35bdb5dcc2ff1484759a07
echo 'Resolve conflicts and force push this branch'
