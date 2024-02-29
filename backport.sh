git reset HEAD~1
rm ./backport.sh
git cherry-pick 3a016bedf4892a34ccec6d0bc136178a119dd228
echo 'Resolve conflicts and force push this branch'
