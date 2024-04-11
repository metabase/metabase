git reset HEAD~1
rm ./backport.sh
git cherry-pick 4eea9108d6f7740f74a353700e71f1e650feef4f
echo 'Resolve conflicts and force push this branch'
