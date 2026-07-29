git reset HEAD~1
rm ./backport.sh
git cherry-pick 2edc737aea66962ec3c93ce0ecfcf7073081ebec
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
