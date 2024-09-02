git reset HEAD~1
rm ./backport.sh
git cherry-pick 25c2269023e1b5d2de3991623c11aef3bd08485e
echo 'Resolve conflicts and force push this branch'
