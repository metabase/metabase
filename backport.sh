git reset HEAD~1
rm ./backport.sh
git cherry-pick 6b4631a9ee8dd3d71a2de6862396c18813bc83e1
echo 'Resolve conflicts and force push this branch'
