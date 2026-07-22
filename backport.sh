git reset HEAD~1
rm ./backport.sh
git cherry-pick 075482040b40668064afcb16fa427c79d2e59536
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
