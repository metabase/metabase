git reset HEAD~1
rm ./backport.sh
git cherry-pick 33d8adc109d6a48a18eab01e86364753b11c606a
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
