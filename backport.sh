git reset HEAD~1
rm ./backport.sh
git cherry-pick ee52a52a52063102d0049bc5b80a68dce8213976
echo 'Resolve conflicts and force push this branch'
