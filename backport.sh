git reset HEAD~1
rm ./backport.sh
git cherry-pick c40657ff3ac437a69c08ca910d9bbcd814fed7ff
echo 'Resolve conflicts and force push this branch'
