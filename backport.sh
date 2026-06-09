git reset HEAD~1
rm ./backport.sh
git cherry-pick e81e4c8c9da31dd04e6869801ccca30bd6537406
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
