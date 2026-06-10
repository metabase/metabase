git reset HEAD~1
rm ./backport.sh
git cherry-pick dacc0adad0f8415a2646e4e3b848fab008cbbd5b
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
