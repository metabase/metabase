git reset HEAD~1
rm ./backport.sh
git cherry-pick 42dc5239db63f233dd86181f4e7ad0487c5a6d04
echo 'Resolve conflicts and force push this branch'
