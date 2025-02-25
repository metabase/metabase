git reset HEAD~1
rm ./backport.sh
git cherry-pick 70e81f83042dbb04a70ef31e6743c0a1d97aa71d
echo 'Resolve conflicts and force push this branch'
