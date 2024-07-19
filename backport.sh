git reset HEAD~1
rm ./backport.sh
git cherry-pick 66afb0d7fe1f8a99306db8ce2ec6d3586ab85cf6
echo 'Resolve conflicts and force push this branch'
