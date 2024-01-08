git reset HEAD~1
rm ./backport.sh
git cherry-pick b4408e033fae30ea08e53037d73ad1dcac45f4dd
echo 'Resolve conflicts and force push this branch'
