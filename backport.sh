git reset HEAD~1
rm ./backport.sh
git cherry-pick 7374e61ed7beff1821cbfefe63d303ce57b98ab8
echo 'Resolve conflicts and force push this branch'
