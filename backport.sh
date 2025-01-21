git reset HEAD~1
rm ./backport.sh
git cherry-pick f6b9e3b0d23eac21d987c62aab836730b8242741
echo 'Resolve conflicts and force push this branch'
