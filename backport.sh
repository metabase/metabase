git reset HEAD~1
rm ./backport.sh
git cherry-pick b75ef21b91696dd940802f7bf3dad8bb73fceba6
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
