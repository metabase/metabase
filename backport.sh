git reset HEAD~1
rm ./backport.sh
git cherry-pick 78b66bcae60588f9840f4e357e86a5a4a73bb2ac
echo 'Resolve conflicts and force push this branch'
