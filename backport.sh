git reset HEAD~1
rm ./backport.sh
git cherry-pick 43292e6a0eb5d8d1977e9a6c9e6931898a437418
echo 'Resolve conflicts and force push this branch'
