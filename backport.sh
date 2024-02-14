git reset HEAD~1
rm ./backport.sh
git cherry-pick a7ffe745c8c6d5653a949f8f228df75e1fd7f8cb
echo 'Resolve conflicts and force push this branch'
