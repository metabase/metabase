git reset HEAD~1
rm ./backport.sh
git cherry-pick 0cce65e2cb84f7732589801d775487e3ddfd2363
echo 'Resolve conflicts and force push this branch'
