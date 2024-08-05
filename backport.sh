git reset HEAD~1
rm ./backport.sh
git cherry-pick a05452ef2e089c55036060a73161630be9a685f1
echo 'Resolve conflicts and force push this branch'
