git reset HEAD~1
rm ./backport.sh
git cherry-pick 2ba5c4d93e4c0732c7c302cb1693b1832761ffae
echo 'Resolve conflicts and force push this branch'
