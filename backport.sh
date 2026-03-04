git reset HEAD~1
rm ./backport.sh
git cherry-pick 88f48ce9969772f6e10aa378874d59475c26e191
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
