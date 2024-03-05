git reset HEAD~1
rm ./backport.sh
git cherry-pick 915f5fca8fad2db81120e13396e93c69db92f38b
echo 'Resolve conflicts and force push this branch'
