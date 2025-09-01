git reset HEAD~1
rm ./backport.sh
git cherry-pick 88aaf247940f0dfd1cacb3a25ccea2a991ac2950
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
