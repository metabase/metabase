git reset HEAD~1
rm ./backport.sh
git cherry-pick a3c3193474d50c2a4726118cf844d8ed3bb8e974
echo 'Resolve conflicts and force push this branch'
