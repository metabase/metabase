git reset HEAD~1
rm ./backport.sh
git cherry-pick 51bc6d11acd758840333475385c53191363b2fb9
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
