git reset HEAD~1
rm ./backport.sh
git cherry-pick 180cf7870b91c722375d6842ceb19d1b223df294
echo 'Resolve conflicts and force push this branch'
