git reset HEAD~1
rm ./backport.sh
git cherry-pick 9ff67b56fce4d6dc8c0a85432719e6fc080daa01
echo 'Resolve conflicts and force push this branch'
