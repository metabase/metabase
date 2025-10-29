git reset HEAD~1
rm ./backport.sh
git cherry-pick 95fa314e44ac099891832ee0c70b4a808e9c2bbb
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
