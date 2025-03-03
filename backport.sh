git reset HEAD~1
rm ./backport.sh
git cherry-pick 919a393bf3f99d41eb697990ecc146ffb372b5d3
echo 'Resolve conflicts and force push this branch'
