git reset HEAD~1
rm ./backport.sh
git cherry-pick b8da46c9d8a926be27190b69527d12b1cf1c067a
echo 'Resolve conflicts and force push this branch'
