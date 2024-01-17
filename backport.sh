git reset HEAD~1
rm ./backport.sh
git cherry-pick 280b7cb839d407083ff4ae33c2cead34f6d943bb
echo 'Resolve conflicts and force push this branch'
