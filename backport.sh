git reset HEAD~1
rm ./backport.sh
git cherry-pick 0f5a6253e3730ca58799207c596357dd04fc2228
echo 'Resolve conflicts and force push this branch'
