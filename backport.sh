git reset HEAD~1
rm ./backport.sh
git cherry-pick e5aa995590732c123172d4765554f38f430be2cf
echo 'Resolve conflicts and force push this branch'
