git reset HEAD~1
rm ./backport.sh
git cherry-pick 1fa5a933c68ebf76b3f8af9baee00fe1cf319297
echo 'Resolve conflicts and force push this branch'
