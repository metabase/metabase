git reset HEAD~1
rm ./backport.sh
git cherry-pick 1cf192329470f3e2a06ce119e29bca5b215f62b4
echo 'Resolve conflicts and force push this branch'
