git reset HEAD~1
rm ./backport.sh
git cherry-pick 0376d71bd7e8c171933bcf05bf1d08487453b478
echo 'Resolve conflicts and force push this branch'
