git reset HEAD~1
rm ./backport.sh
git cherry-pick f47b0ae18acb6716087c3f7da5ff5b99ac1c2c41
echo 'Resolve conflicts and force push this branch'
