git reset HEAD~1
rm ./backport.sh
git cherry-pick 41baa8568be18c49dd874b83ea08f3d8140626cd
echo 'Resolve conflicts and force push this branch'
