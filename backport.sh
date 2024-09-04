git reset HEAD~1
rm ./backport.sh
git cherry-pick 6305e59edc02f2421d90a0fd663cf16314c4cc97
echo 'Resolve conflicts and force push this branch'
