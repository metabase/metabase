git reset HEAD~1
rm ./backport.sh
git cherry-pick 89dc03f2c747f579dceda8e4624509b697d0339a
echo 'Resolve conflicts and force push this branch'
