git reset HEAD~1
rm ./backport.sh
git cherry-pick 0e514b4549c3d5f31ccd8d860bb0f0ae1ac5c628
echo 'Resolve conflicts and force push this branch'
