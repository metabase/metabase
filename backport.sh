git reset HEAD~1
rm ./backport.sh
git cherry-pick d3bb48844a3345fef1da4938127040b35648678f
echo 'Resolve conflicts and force push this branch'
