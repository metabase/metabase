git reset HEAD~1
rm ./backport.sh
git cherry-pick 9fb173967fff9883ecd53130ed8b8aa7ccadaca1
echo 'Resolve conflicts and force push this branch'
