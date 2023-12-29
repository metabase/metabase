git reset HEAD~1
rm ./backport.sh
git cherry-pick c3d6f71e3d64f9605e20828daac189cff314b9e5
echo 'Resolve conflicts and force push this branch'
