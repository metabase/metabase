git reset HEAD~1
rm ./backport.sh
git cherry-pick e26c89311e429700d56399bf9da5b4b5dac18b79
echo 'Resolve conflicts and force push this branch'
