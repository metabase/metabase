git reset HEAD~1
rm ./backport.sh
git cherry-pick af3156b9dd814873dd1b7b7dfe8f1e3a5225f959
echo 'Resolve conflicts and force push this branch'
