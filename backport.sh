git reset HEAD~1
rm ./backport.sh
git cherry-pick 48863d24c39ffef64ca1c8728e4ace761fe1f7f6
echo 'Resolve conflicts and force push this branch'
