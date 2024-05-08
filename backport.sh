git reset HEAD~1
rm ./backport.sh
git cherry-pick 07a22a881854886eac81327ed9b7864c7519e9c5
echo 'Resolve conflicts and force push this branch'
