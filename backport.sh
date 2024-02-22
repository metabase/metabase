git reset HEAD~1
rm ./backport.sh
git cherry-pick ac3734876c162d8ebc909967ee8507309b4fbaf1
echo 'Resolve conflicts and force push this branch'
