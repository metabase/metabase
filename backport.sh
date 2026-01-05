git reset HEAD~1
rm ./backport.sh
git cherry-pick 119487b1ccc1dbe9ec2307bb579da10341d73db8
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
