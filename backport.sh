git reset HEAD~1
rm ./backport.sh
git cherry-pick 0ff6ef52245a3a4a9e5f798aba4433e03a8adac8
echo 'Resolve conflicts and force push this branch'
