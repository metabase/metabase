git reset HEAD~1
rm ./backport.sh
git cherry-pick 1158d45637c1ece39764f7f7f1524f30064fa4ed
echo 'Resolve conflicts and force push this branch'
