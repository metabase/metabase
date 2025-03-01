git reset HEAD~1
rm ./backport.sh
git cherry-pick b4af3f80d36255052537596859862c39f383d8d0
echo 'Resolve conflicts and force push this branch'
