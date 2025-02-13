git reset HEAD~1
rm ./backport.sh
git cherry-pick f88dafb8be207611a80c4ea09a9ae9daf4b8f4a4
echo 'Resolve conflicts and force push this branch'
