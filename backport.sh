git reset HEAD~1
rm ./backport.sh
git cherry-pick 05646572e8ed6356b4fb7af3a2ef4f4b460ebedf
echo 'Resolve conflicts and force push this branch'
