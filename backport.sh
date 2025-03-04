git reset HEAD~1
rm ./backport.sh
git cherry-pick bc54de38b3d919cb172ef8cdd50801bc3a3d926b
echo 'Resolve conflicts and force push this branch'
