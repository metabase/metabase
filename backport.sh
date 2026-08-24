git reset HEAD~1
rm ./backport.sh
git cherry-pick 8339e57d2ce250031ff33a9c842cc7ff6581f3ae
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
