git reset HEAD~1
rm ./backport.sh
git cherry-pick e8da11c117ebec846a0887658153f6161a995cc9
echo 'Resolve conflicts and force push this branch'
