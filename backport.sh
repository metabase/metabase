git reset HEAD~1
rm ./backport.sh
git cherry-pick 84b27f02a5f6f8ccfecc31d5cb7f57338290d0ad
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
