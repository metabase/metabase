git reset HEAD~1
rm ./backport.sh
git cherry-pick 61f7c7f243b4af3682d96fca852146a71e91ed0e
echo 'Resolve conflicts and force push this branch'
