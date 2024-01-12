git reset HEAD~1
rm ./backport.sh
git cherry-pick 422dc5ebff0fa7b0435124761b0829a60e7f3bbb
echo 'Resolve conflicts and force push this branch'
