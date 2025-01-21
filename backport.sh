git reset HEAD~1
rm ./backport.sh
git cherry-pick b94b107b81b638d9356f13cf9998937c8a3e7c68
echo 'Resolve conflicts and force push this branch'
