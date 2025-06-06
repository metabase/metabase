git reset HEAD~1
rm ./backport.sh
git cherry-pick 505ce6bf19ebede482c29963a07325c295156e36
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
