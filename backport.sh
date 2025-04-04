git reset HEAD~1
rm ./backport.sh
git cherry-pick 121718dd5ac58f2f02dc73cf01006bee82b5a7bc
echo 'Resolve conflicts and force push this branch'
