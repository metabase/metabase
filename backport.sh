git reset HEAD~1
rm ./backport.sh
git cherry-pick 7bfb4662d1ab7846ad67b0813ae4a1bf15fa7287
echo 'Resolve conflicts and force push this branch'
