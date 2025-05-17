git reset HEAD~1
rm ./backport.sh
git cherry-pick caffffd8021c84bb72b376d2a4f7e0a6fdc531f2
echo 'Resolve conflicts and force push this branch'
