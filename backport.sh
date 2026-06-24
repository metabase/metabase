git reset HEAD~1
rm ./backport.sh
git cherry-pick d07294ea214a863b24beb49fbaa82797a2a4285c
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
