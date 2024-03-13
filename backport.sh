git reset HEAD~1
rm ./backport.sh
git cherry-pick 3fc34fcc1c5b679fe73ff7f9531e0afaba426bd5
echo 'Resolve conflicts and force push this branch'
