git reset HEAD~1
rm ./backport.sh
git cherry-pick 4f25760eab98e69105d86fb4b49572094ac741de
echo 'Resolve conflicts and force push this branch'
