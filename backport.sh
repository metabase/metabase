git reset HEAD~1
rm ./backport.sh
git cherry-pick 8cb3e540ddc99192f5390d6b1c288571b0f796a2
echo 'Resolve conflicts and force push this branch'
