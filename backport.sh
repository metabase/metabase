git reset HEAD~1
rm ./backport.sh
git cherry-pick 4ef76d2f0ffab49b20c7f74be0ec14d849edabfe
echo 'Resolve conflicts and force push this branch'
