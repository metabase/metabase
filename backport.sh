git reset HEAD~1
rm ./backport.sh
git cherry-pick dc91b7f50891495bcd2a58455258b1181d5a3be2
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
