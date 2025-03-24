git reset HEAD~1
rm ./backport.sh
git cherry-pick 1c0bbf23fd01a312be0cf019646bd2efe6fbe4cf
echo 'Resolve conflicts and force push this branch'
