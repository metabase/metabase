git reset HEAD~1
rm ./backport.sh
git cherry-pick 3f6b4e3938b17b0e69f9c505115a484cd1851190
echo 'Resolve conflicts and force push this branch'
