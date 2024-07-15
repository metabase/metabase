git reset HEAD~1
rm ./backport.sh
git cherry-pick abf1c6b2319cd6b904da24e343fec5d3191cbfb9
echo 'Resolve conflicts and force push this branch'
