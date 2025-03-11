git reset HEAD~1
rm ./backport.sh
git cherry-pick 9a7cbd0ba4e12ec525d1c44d47d5bef58f6ab287
echo 'Resolve conflicts and force push this branch'
