git reset HEAD~1
rm ./backport.sh
git cherry-pick c4b3e79200407b1503aa64a6ca565a6221ae8cee
echo 'Resolve conflicts and force push this branch'
