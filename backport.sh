git reset HEAD~1
rm ./backport.sh
git cherry-pick c5c274646b4e2cf81bde83b92318beb1717c20fd
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
