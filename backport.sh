git reset HEAD~1
rm ./backport.sh
git cherry-pick 34ebffa9864319fdcf6cc5224a75fbd92c7629e7
echo 'Resolve conflicts and force push this branch'
