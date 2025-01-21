git reset HEAD~1
rm ./backport.sh
git cherry-pick f435376eaad492b9e4de811809fe8c1dec57d0f6
echo 'Resolve conflicts and force push this branch'
