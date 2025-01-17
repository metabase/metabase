git reset HEAD~1
rm ./backport.sh
git cherry-pick d304dae6686ab52c876b758659ef7792be631514
echo 'Resolve conflicts and force push this branch'
