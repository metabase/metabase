git reset HEAD~1
rm ./backport.sh
git cherry-pick 70ec6d8615d0572f2c77b3722c5216f1940c4424
echo 'Resolve conflicts and force push this branch'
