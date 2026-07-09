git reset HEAD~1
rm ./backport.sh
git cherry-pick 31a0379d5d5471458e3e95f33f93f9664c5f3870
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
