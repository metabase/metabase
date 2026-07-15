git reset HEAD~1
rm ./backport.sh
git cherry-pick 611ef3690b386e896366277ba1cf1da7cbc7935c
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
