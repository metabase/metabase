git reset HEAD~1
rm ./backport.sh
git cherry-pick fe5c9864d13ce695d20e232cbfc9ac2e1fb7554a
echo 'Resolve conflicts and force push this branch'
