git reset HEAD~1
rm ./backport.sh
git cherry-pick 18581104b99dcd014e69d34d4bb18c718dbfb082
echo 'Resolve conflicts and force push this branch'
