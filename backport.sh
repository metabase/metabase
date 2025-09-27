git reset HEAD~1
rm ./backport.sh
git cherry-pick 8434b2376420966a4b87a30d99045c426af4d050
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
