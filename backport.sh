git reset HEAD~1
rm ./backport.sh
git cherry-pick 9a521649a351e59eae9c54d8200f985ed53fc0c2
echo 'Resolve conflicts and force push this branch'
