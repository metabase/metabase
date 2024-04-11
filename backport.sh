git reset HEAD~1
rm ./backport.sh
git cherry-pick 30bbf73392c002a5e94cb1c919b206c5d2520b45
echo 'Resolve conflicts and force push this branch'
