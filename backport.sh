git reset HEAD~1
rm ./backport.sh
git cherry-pick 1fe63c52bfed1aacb70923bac9f60850709871c2
echo 'Resolve conflicts and force push this branch'
