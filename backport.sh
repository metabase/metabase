git reset HEAD~1
rm ./backport.sh
git cherry-pick e97a889f340fc4986b24510de60318dc043a2e71
echo 'Resolve conflicts and force push this branch'
