git reset HEAD~1
rm ./backport.sh
git cherry-pick 27587264f4e0b4dd3cb617c7f18c319a57e3f4c2
echo 'Resolve conflicts and force push this branch'
