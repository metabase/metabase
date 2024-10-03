git reset HEAD~1
rm ./backport.sh
git cherry-pick 24232c6736d7bb92d1a07cb1be6543ccfa55f8cc
echo 'Resolve conflicts and force push this branch'
