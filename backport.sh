git reset HEAD~1
rm ./backport.sh
git cherry-pick 6994d6ca24d825f3e9fffb6f59f46dc8574c9417
echo 'Resolve conflicts and force push this branch'
