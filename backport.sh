git reset HEAD~1
rm ./backport.sh
git cherry-pick a37544cc805d8b54cf3fc040223f22fc94a72c28
echo 'Resolve conflicts and force push this branch'
