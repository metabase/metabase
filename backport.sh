git reset HEAD~1
rm ./backport.sh
git cherry-pick 6c890a3a289a8fa31dcae219c4a71e8d9b0db590
echo 'Resolve conflicts and force push this branch'
