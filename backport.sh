git reset HEAD~1
rm ./backport.sh
git cherry-pick f6ae0f2844bf97039704111c9114bd6f5ff865b0
echo 'Resolve conflicts and force push this branch'
