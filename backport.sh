git reset HEAD~1
rm ./backport.sh
git cherry-pick 72a201819b3255c3753591297f90f05819d200cc
echo 'Resolve conflicts and force push this branch'
