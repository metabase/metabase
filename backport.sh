git reset HEAD~1
rm ./backport.sh
git cherry-pick 39a1a1730331d2c299c7bca1f6f30bf3aa6d2c97
echo 'Resolve conflicts and force push this branch'
