git reset HEAD~1
rm ./backport.sh
git cherry-pick 3beb7fbea21638843bf5be407dac2dfd020fd5d8
echo 'Resolve conflicts and force push this branch'
