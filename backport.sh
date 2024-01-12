git reset HEAD~1
rm ./backport.sh
git cherry-pick 47175ac17dea019245a45caf38ff73d97052440c
echo 'Resolve conflicts and force push this branch'
