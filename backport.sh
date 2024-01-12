git reset HEAD~1
rm ./backport.sh
git cherry-pick 6fafcb348da5a7e69ff64af9c743d1d2e19130ae
echo 'Resolve conflicts and force push this branch'
