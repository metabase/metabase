git reset HEAD~1
rm ./backport.sh
git cherry-pick 17bff867cef97121791686263cd7466c002ed3e4
echo 'Resolve conflicts and force push this branch'
