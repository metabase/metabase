git reset HEAD~1
rm ./backport.sh
git cherry-pick 6f0161ac444a2e2d79d14ac83e972a5fbf039d2f
echo 'Resolve conflicts and force push this branch'
