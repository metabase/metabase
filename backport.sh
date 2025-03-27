git reset HEAD~1
rm ./backport.sh
git cherry-pick 4c29538c1f27260d256b1ca236f60e73774ed674
echo 'Resolve conflicts and force push this branch'
