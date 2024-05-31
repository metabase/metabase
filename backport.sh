git reset HEAD~1
rm ./backport.sh
git cherry-pick 55c00bdd9044989ab5dc20d385e5e3c70330fc3a
echo 'Resolve conflicts and force push this branch'
