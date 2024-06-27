git reset HEAD~1
rm ./backport.sh
git cherry-pick e0381e9bc912f343c31bfb40314990015152a634
echo 'Resolve conflicts and force push this branch'
