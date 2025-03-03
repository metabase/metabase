git reset HEAD~1
rm ./backport.sh
git cherry-pick 752e9246e59541a3e70968959bfd1e1b9592c4e1
echo 'Resolve conflicts and force push this branch'
