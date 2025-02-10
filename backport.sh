git reset HEAD~1
rm ./backport.sh
git cherry-pick ecabdc59ecb06b269b04127ae03d7b3bf1be73e4
echo 'Resolve conflicts and force push this branch'
