git reset HEAD~1
rm ./backport.sh
git cherry-pick 1e50d9f3a875191d95d60b0e70fe46d1cf4eca2c
echo 'Resolve conflicts and force push this branch'
