git reset HEAD~1
rm ./backport.sh
git cherry-pick e4c50175c2a7f4a34f36160b05c978ff7e40f56a
echo 'Resolve conflicts and force push this branch'
