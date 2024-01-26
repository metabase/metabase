git reset HEAD~1
rm ./backport.sh
git cherry-pick c988a90fff1bdd29ee9183bc1581888d2e52771a
echo 'Resolve conflicts and force push this branch'
