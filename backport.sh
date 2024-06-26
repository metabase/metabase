git reset HEAD~1
rm ./backport.sh
git cherry-pick 9ce72a44cd1214019088379987b5bb903a5007f1
echo 'Resolve conflicts and force push this branch'
