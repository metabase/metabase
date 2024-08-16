git reset HEAD~1
rm ./backport.sh
git cherry-pick 8272ac47606afba5afd45d9f4bab845f9fc00fd7
echo 'Resolve conflicts and force push this branch'
