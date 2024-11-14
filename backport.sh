git reset HEAD~1
rm ./backport.sh
git cherry-pick 87204effb271d06cf5c34091119c111089e12bd9
echo 'Resolve conflicts and force push this branch'
