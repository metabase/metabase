git reset HEAD~1
rm ./backport.sh
git cherry-pick 8255a879de721856f6984f3a57a7e055cb86e2f9
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
