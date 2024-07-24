git reset HEAD~1
rm ./backport.sh
git cherry-pick cfc61529281ff3e26a1b9996ce7dc72c0b1a599e
echo 'Resolve conflicts and force push this branch'
