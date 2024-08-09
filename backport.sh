git reset HEAD~1
rm ./backport.sh
git cherry-pick afa66abf943cbf68b39f84e053808bc0c8ac334c
echo 'Resolve conflicts and force push this branch'
