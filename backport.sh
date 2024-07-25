git reset HEAD~1
rm ./backport.sh
git cherry-pick 575fa4edd893c09b3698122c07cd6ec2ef593e5d
echo 'Resolve conflicts and force push this branch'
