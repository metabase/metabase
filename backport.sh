git reset HEAD~1
rm ./backport.sh
git cherry-pick 0fb515cbc62263ae13fefd2791e9a0c082e9568e
echo 'Resolve conflicts and force push this branch'
