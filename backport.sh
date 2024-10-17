git reset HEAD~1
rm ./backport.sh
git cherry-pick fe8642dad54956271df1c2d1ffd89f09ee8df64b
echo 'Resolve conflicts and force push this branch'
