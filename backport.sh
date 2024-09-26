git reset HEAD~1
rm ./backport.sh
git cherry-pick 402ddc7e588fe6cc71c5ec5a98ee2017e5d8be2c
echo 'Resolve conflicts and force push this branch'
