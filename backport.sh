git reset HEAD~1
rm ./backport.sh
git cherry-pick c6ac90b483bf5b55df4d86a5538d0176e40b09ec
echo 'Resolve conflicts and force push this branch'
