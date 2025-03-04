git reset HEAD~1
rm ./backport.sh
git cherry-pick d71862d0417b34fad6672102b3b6021a59f71169
echo 'Resolve conflicts and force push this branch'
