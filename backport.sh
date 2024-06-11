git reset HEAD~1
rm ./backport.sh
git cherry-pick ce5d2547e75606ba895581b1e99e44a3ae8d2b93
echo 'Resolve conflicts and force push this branch'
