git reset HEAD~1
rm ./backport.sh
git cherry-pick ea7bd55939d0dfd44b3e3e0605721e336c9429e4
echo 'Resolve conflicts and force push this branch'
