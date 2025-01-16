git reset HEAD~1
rm ./backport.sh
git cherry-pick 359c55dd2e29420a71004d7f1ada87a06660590f
echo 'Resolve conflicts and force push this branch'
