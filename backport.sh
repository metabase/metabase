git reset HEAD~1
rm ./backport.sh
git cherry-pick 45f541521b52ce5af1a01a2099712ae566203b42
echo 'Resolve conflicts and force push this branch'
