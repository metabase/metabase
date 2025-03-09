git reset HEAD~1
rm ./backport.sh
git cherry-pick a5a7e5188dab523800883f109a5a35275dded85b
echo 'Resolve conflicts and force push this branch'
