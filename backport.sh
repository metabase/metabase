git reset HEAD~1
rm ./backport.sh
git cherry-pick ad537f2ad95952b66938df4804fac12679544aad
echo 'Resolve conflicts and force push this branch'
