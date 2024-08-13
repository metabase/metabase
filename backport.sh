git reset HEAD~1
rm ./backport.sh
git cherry-pick 719f3ed6ac707d8be232b8a02d77e2f0ed3934db
echo 'Resolve conflicts and force push this branch'
