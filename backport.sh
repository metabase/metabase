git reset HEAD~1
rm ./backport.sh
git cherry-pick 02f5a20e3856a9c20fa93fae88c28b12f99c727c
echo 'Resolve conflicts and force push this branch'
