git reset HEAD~1
rm ./backport.sh
git cherry-pick 9eca54817cd0cfa74344e5bdf3805feaed5ed88a
echo 'Resolve conflicts and force push this branch'
