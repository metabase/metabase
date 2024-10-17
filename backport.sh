git reset HEAD~1
rm ./backport.sh
git cherry-pick 94496eb579f860385e38847cfc6d169a4525c008
echo 'Resolve conflicts and force push this branch'
