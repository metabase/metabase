git reset HEAD~1
rm ./backport.sh
git cherry-pick c1a8102d17cd7e88d4d568cc8dfb7f8a258c98b6
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
