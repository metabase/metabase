git reset HEAD~1
rm ./backport.sh
git cherry-pick 30fff3b714c765cd2104cce119694304cb239f63
echo 'Resolve conflicts and force push this branch'
