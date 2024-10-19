git reset HEAD~1
rm ./backport.sh
git cherry-pick c92e8c993f9f82db7a3e5c5757595b55ba833c8c
echo 'Resolve conflicts and force push this branch'
