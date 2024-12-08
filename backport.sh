git reset HEAD~1
rm ./backport.sh
git cherry-pick 168bd09275dbe394679e48d5719e1b5543639251
echo 'Resolve conflicts and force push this branch'
