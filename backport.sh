git reset HEAD~1
rm ./backport.sh
git cherry-pick 2c3c3284722921fef50263b4c6e30687a5e40f47
echo 'Resolve conflicts and force push this branch'
