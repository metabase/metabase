git reset HEAD~1
rm ./backport.sh
git cherry-pick c890601b2eea951a29a2030fcc721621c7fa9391
echo 'Resolve conflicts and force push this branch'
