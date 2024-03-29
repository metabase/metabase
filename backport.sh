git reset HEAD~1
rm ./backport.sh
git cherry-pick 9423ca83c060c76db4a2ca214937f918c0bcf48d
echo 'Resolve conflicts and force push this branch'
