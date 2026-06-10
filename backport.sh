git reset HEAD~1
rm ./backport.sh
git cherry-pick 442c7ee3512ef3fa3cedd3922e2f521597872f82
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
