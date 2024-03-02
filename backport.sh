git reset HEAD~1
rm ./backport.sh
git cherry-pick ead86bf61082c6690d04e4f4a829e25fb0c88c25
echo 'Resolve conflicts and force push this branch'
