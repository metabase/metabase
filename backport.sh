git reset HEAD~1
rm ./backport.sh
git cherry-pick c14d89e731c460de0954a2704ee55e45becaeb10
echo 'Resolve conflicts and force push this branch'
