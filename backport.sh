git reset HEAD~1
rm ./backport.sh
git cherry-pick 8a0e48b03886150603c1b73f4624574ed11509c7
echo 'Resolve conflicts and force push this branch'
