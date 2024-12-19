git reset HEAD~1
rm ./backport.sh
git cherry-pick f9b87a3f6bbfbb8e64f945f001ac56a9dd48c56e
echo 'Resolve conflicts and force push this branch'
