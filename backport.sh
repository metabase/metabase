git reset HEAD~1
rm ./backport.sh
git cherry-pick 8ea5431774c03bd4450a05e21e766c1ef0c1c244
echo 'Resolve conflicts and force push this branch'
