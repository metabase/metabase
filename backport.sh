git reset HEAD~1
rm ./backport.sh
git cherry-pick b72bc0eeb0d4ac8c4c7d7eeaa7f09579c348957f
echo 'Resolve conflicts and force push this branch'
