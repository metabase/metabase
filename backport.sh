git reset HEAD~1
rm ./backport.sh
git cherry-pick c1ba28f7c0f5b50b76b78406dc6c1cab13399a57
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
