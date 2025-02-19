git reset HEAD~1
rm ./backport.sh
git cherry-pick 59974f065a6b7a2841751b9f74d71df2bf3bf9fa
echo 'Resolve conflicts and force push this branch'
