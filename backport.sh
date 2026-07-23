git reset HEAD~1
rm ./backport.sh
git cherry-pick a37f29e7374a0bb5a60a0df112d9f06b92a57626
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
