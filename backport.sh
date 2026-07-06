git reset HEAD~1
rm ./backport.sh
git cherry-pick 79002d46661e886181dc2443b563de40580ababd
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
