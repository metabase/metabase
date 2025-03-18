git reset HEAD~1
rm ./backport.sh
git cherry-pick 9a4605143f567ed59abf3b58c6c94a9f71ea0f03
echo 'Resolve conflicts and force push this branch'
