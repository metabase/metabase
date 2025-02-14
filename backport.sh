git reset HEAD~1
rm ./backport.sh
git cherry-pick 56131a0fd82b831f44279f26d7e2ba97e00f5588
echo 'Resolve conflicts and force push this branch'
