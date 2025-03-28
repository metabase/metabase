git reset HEAD~1
rm ./backport.sh
git cherry-pick 20276982a86037918d3f7bb53b08c747ddffbcae
echo 'Resolve conflicts and force push this branch'
