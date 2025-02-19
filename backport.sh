git reset HEAD~1
rm ./backport.sh
git cherry-pick 8423d6382a9635026918277203ee14ebb09ff942
echo 'Resolve conflicts and force push this branch'
