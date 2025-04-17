git reset HEAD~1
rm ./backport.sh
git cherry-pick 764b2366015df4594d3e7745234fdef126abc3b5
echo 'Resolve conflicts and force push this branch'
