git reset HEAD~1
rm ./backport.sh
git cherry-pick b299b37501ced63c73c5a45820ead56a2ca6900d
echo 'Resolve conflicts and force push this branch'
