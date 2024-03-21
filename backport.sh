git reset HEAD~1
rm ./backport.sh
git cherry-pick c1cfdd9f3730a36075750750d64af206a1820172
echo 'Resolve conflicts and force push this branch'
