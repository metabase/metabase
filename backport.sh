git reset HEAD~1
rm ./backport.sh
git cherry-pick c7bf7d1defaab3043a3facc182023a90548298f4
echo 'Resolve conflicts and force push this branch'
