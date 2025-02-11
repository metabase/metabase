git reset HEAD~1
rm ./backport.sh
git cherry-pick 869d810773e5b5de184be3ec220c354a43647e12
echo 'Resolve conflicts and force push this branch'
