git reset HEAD~1
rm ./backport.sh
git cherry-pick f78b4159270b32b86959c9f9c6f3663d89da7c26
echo 'Resolve conflicts and force push this branch'
