git reset HEAD~1
rm ./backport.sh
git cherry-pick 2febfbb44df1d231e921105dbbf068cb6714885e
echo 'Resolve conflicts and force push this branch'
