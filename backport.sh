git reset HEAD~1
rm ./backport.sh
git cherry-pick a9b9c0fe7d6bba245d8b15644ba4a44db563310c
echo 'Resolve conflicts and force push this branch'
