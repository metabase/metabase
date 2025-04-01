git reset HEAD~1
rm ./backport.sh
git cherry-pick a582ad33c4050d0bdadeaa48338d8b271c487d4f
echo 'Resolve conflicts and force push this branch'
