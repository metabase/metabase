git reset HEAD~1
rm ./backport.sh
git cherry-pick b58d4978853e94ccdb273de51288ec6e51238372
echo 'Resolve conflicts and force push this branch'
