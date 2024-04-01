git reset HEAD~1
rm ./backport.sh
git cherry-pick 6d146ab82d0efe13f93f8cc632c3dd374b33b42f
echo 'Resolve conflicts and force push this branch'
