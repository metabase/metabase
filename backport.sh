git reset HEAD~1
rm ./backport.sh
git cherry-pick 7866f7e20be21cb8d80db70b6ce7c583c97c6b68
echo 'Resolve conflicts and force push this branch'
