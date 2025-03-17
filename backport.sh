git reset HEAD~1
rm ./backport.sh
git cherry-pick db12bcbd4f58744b621c240079f50d2caef30b52
echo 'Resolve conflicts and force push this branch'
