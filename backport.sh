git reset HEAD~1
rm ./backport.sh
git cherry-pick 928c6db5c661b687321e93889b448e52caaaf4cf
echo 'Resolve conflicts and force push this branch'
