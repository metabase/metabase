git reset HEAD~1
rm ./backport.sh
git cherry-pick bc1a66fcf384106944b2db8b031fcaf8b0120985
echo 'Resolve conflicts and force push this branch'
