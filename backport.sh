git reset HEAD~1
rm ./backport.sh
git cherry-pick 4c00bc49821f8de51bb27c51fb43d7ac1bdb6607
echo 'Resolve conflicts and force push this branch'
