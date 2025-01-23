git reset HEAD~1
rm ./backport.sh
git cherry-pick 8a5eb475796a85d062762674ffbf18d42d58d4b6
echo 'Resolve conflicts and force push this branch'
