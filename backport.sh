git reset HEAD~1
rm ./backport.sh
git cherry-pick 31eefe0d39748ab0a3849d2d714efeb30dfe7c71
echo 'Resolve conflicts and force push this branch'
