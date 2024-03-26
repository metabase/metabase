git reset HEAD~1
rm ./backport.sh
git cherry-pick 4543a7fd9b1c6c4fa2222ef72e1455f04ce5440d
echo 'Resolve conflicts and force push this branch'
