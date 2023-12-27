git reset HEAD~1
rm ./backport.sh
git cherry-pick 1a176e8803b9fcec041f27891606b35a400f35eb
echo 'Resolve conflicts and force push this branch'
