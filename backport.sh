git reset HEAD~1
rm ./backport.sh
git cherry-pick 6e7e51f581847f8639dd854733e2d50e66f8c729
echo 'Resolve conflicts and force push this branch'
