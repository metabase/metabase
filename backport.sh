git reset HEAD~1
rm ./backport.sh
git cherry-pick 8610bfc613b12f8e924e875f45c8736340e465e1
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
