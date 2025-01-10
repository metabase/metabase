git reset HEAD~1
rm ./backport.sh
git cherry-pick 7402b0ee8ef892894c7e0fb788d805ef3636682f
echo 'Resolve conflicts and force push this branch'
