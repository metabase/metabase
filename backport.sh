git reset HEAD~1
rm ./backport.sh
git cherry-pick 8f20b25900efbcee8baaf883fce182093a857127
echo 'Resolve conflicts and force push this branch'
