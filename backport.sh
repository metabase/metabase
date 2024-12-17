git reset HEAD~1
rm ./backport.sh
git cherry-pick 93a703a9118418c4bc8b5d8b111875b8a9f2456a
echo 'Resolve conflicts and force push this branch'
