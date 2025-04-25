git reset HEAD~1
rm ./backport.sh
git cherry-pick 8ad62ccfd5375d46308f95053a0b898ada08e187
echo 'Resolve conflicts and force push this branch'
