git reset HEAD~1
rm ./backport.sh
git cherry-pick f0098c980a5bc5a5438cc2a58cde66d4f18a622d
echo 'Resolve conflicts and force push this branch'
