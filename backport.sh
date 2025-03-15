git reset HEAD~1
rm ./backport.sh
git cherry-pick 769bd1ee1b95d6c04f49ee3955da6872ef6ccdaf
echo 'Resolve conflicts and force push this branch'
