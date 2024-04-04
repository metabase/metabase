git reset HEAD~1
rm ./backport.sh
git cherry-pick c059d8d585ea983e9282b96b32e27d5fe42fd6d1
echo 'Resolve conflicts and force push this branch'
