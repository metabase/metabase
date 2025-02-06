git reset HEAD~1
rm ./backport.sh
git cherry-pick eca452c45f1a2ca625ffa51f23e429ab7e8067f0
echo 'Resolve conflicts and force push this branch'
