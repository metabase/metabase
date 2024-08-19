git reset HEAD~1
rm ./backport.sh
git cherry-pick 65ac2f18ca8a0b6620ded4a0c5db5964dd44fd20
echo 'Resolve conflicts and force push this branch'
