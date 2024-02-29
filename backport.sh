git reset HEAD~1
rm ./backport.sh
git cherry-pick fb6921f857b978a3b6bf21f85fac9a613807cce4
echo 'Resolve conflicts and force push this branch'
