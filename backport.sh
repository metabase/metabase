git reset HEAD~1
rm ./backport.sh
git cherry-pick 2767fce7adff7bf4a18fb1229e02abb137698172
echo 'Resolve conflicts and force push this branch'
