git reset HEAD~1
rm ./backport.sh
git cherry-pick 7722d8db9cdbfbe7d4636e9d3969d48d72eeebdc
echo 'Resolve conflicts and force push this branch'
