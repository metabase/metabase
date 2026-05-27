git reset HEAD~1
rm ./backport.sh
git cherry-pick 00e329ce7e8ea65e19a75c305dca62afba3fc647
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
