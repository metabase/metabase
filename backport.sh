git reset HEAD~1
rm ./backport.sh
git cherry-pick 95e0a447a7915f808485997efbcc9b55b279df30
echo 'Resolve conflicts and force push this branch'
