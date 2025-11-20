git reset HEAD~1
rm ./backport.sh
git cherry-pick 28b5fb79f18e73ddbcfc3361c38689eaceda25d7
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
