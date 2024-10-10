git reset HEAD~1
rm ./backport.sh
git cherry-pick 4e343c1da58cc0d460d3b367ac7343260bd3b888
echo 'Resolve conflicts and force push this branch'
