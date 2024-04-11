git reset HEAD~1
rm ./backport.sh
git cherry-pick fc9d1388e858ad27a5c451c6500d03e6573639a3
echo 'Resolve conflicts and force push this branch'
