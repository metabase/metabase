git reset HEAD~1
rm ./backport.sh
git cherry-pick 860f2beff2b0584863b4f2fdd432a875dd49f412
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
