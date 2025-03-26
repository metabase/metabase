git reset HEAD~1
rm ./backport.sh
git cherry-pick 6aa3663a641823824a0802e1e283050bb49a5e7a
echo 'Resolve conflicts and force push this branch'
