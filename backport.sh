git reset HEAD~1
rm ./backport.sh
git cherry-pick 268268b08d60fd9ab4b606ff4c0cca1e48d080bd
echo 'Resolve conflicts and force push this branch'
