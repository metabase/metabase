git reset HEAD~1
rm ./backport.sh
git cherry-pick 34e647af26d0d64b2804fc0f92337aa5fbf7d572
echo 'Resolve conflicts and force push this branch'
