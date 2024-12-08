git reset HEAD~1
rm ./backport.sh
git cherry-pick 9f00d56275065b212f2cd7f769acd8f508d50ee2
echo 'Resolve conflicts and force push this branch'
