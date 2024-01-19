git reset HEAD~1
rm ./backport.sh
git cherry-pick c6a4f165d203a1b9ccac898937d165cfcc549c17
echo 'Resolve conflicts and force push this branch'
