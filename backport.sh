git reset HEAD~1
rm ./backport.sh
git cherry-pick 5bf50a2131b1c6bd79fd94a4674c7635e254a522
echo 'Resolve conflicts and force push this branch'
