git reset HEAD~1
rm ./backport.sh
git cherry-pick 9f3e0bc68acd572f3f7cc690649c3a6166ca48ab
echo 'Resolve conflicts and force push this branch'
