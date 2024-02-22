git reset HEAD~1
rm ./backport.sh
git cherry-pick 1eb2078c1ed835592177f7f5c04677ed4c3a9405
echo 'Resolve conflicts and force push this branch'
