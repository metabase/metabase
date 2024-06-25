git reset HEAD~1
rm ./backport.sh
git cherry-pick eaf1e80decd54124a0a86c05e11b744dfed02245
echo 'Resolve conflicts and force push this branch'
