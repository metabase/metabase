git reset HEAD~1
rm ./backport.sh
git cherry-pick fe3792cda989ccd864b280c84b56a62ae358b298
echo 'Resolve conflicts and force push this branch'
