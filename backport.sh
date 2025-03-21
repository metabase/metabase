git reset HEAD~1
rm ./backport.sh
git cherry-pick aebf3c8a2d5e11a4c50068e7fdd6b5779b73b602
echo 'Resolve conflicts and force push this branch'
