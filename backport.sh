git reset HEAD~1
rm ./backport.sh
git cherry-pick 60e08be85713fd172d58c20cb81b9f1cc946fe80
echo 'Resolve conflicts and force push this branch'
