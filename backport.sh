git reset HEAD~1
rm ./backport.sh
git cherry-pick 3b627d1bb9bd10ff4bad6121e2ac7801677eeadb
echo 'Resolve conflicts and force push this branch'
