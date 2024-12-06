git reset HEAD~1
rm ./backport.sh
git cherry-pick 47200643e1c61680f7c3d5db5b2536f6a455ea9e
echo 'Resolve conflicts and force push this branch'
