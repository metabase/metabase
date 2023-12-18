git reset HEAD~1
rm ./backport.sh
git cherry-pick ed7295b5d6cdcf26bb81844c9559b3a1eb155b04
echo 'Resolve conflicts and force push this branch'
