git reset HEAD~1
rm ./backport.sh
git cherry-pick 82d25cafe2cc49d12339b294c695da93c44be74a
echo 'Resolve conflicts and force push this branch'
