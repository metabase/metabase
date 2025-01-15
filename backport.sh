git reset HEAD~1
rm ./backport.sh
git cherry-pick 69a4f865fbc4f9e0969252558579f1ae6400063e
echo 'Resolve conflicts and force push this branch'
