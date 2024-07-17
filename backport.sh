git reset HEAD~1
rm ./backport.sh
git cherry-pick 24caede62a8cc294894a8d25f1aa3a570beb3771
echo 'Resolve conflicts and force push this branch'
