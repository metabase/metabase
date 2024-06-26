git reset HEAD~1
rm ./backport.sh
git cherry-pick a4a68f426dfafd9e69656c2a205c7f9295c38cbf
echo 'Resolve conflicts and force push this branch'
