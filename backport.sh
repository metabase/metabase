git reset HEAD~1
rm ./backport.sh
git cherry-pick 4a260bbabb03124634f1ee9da6c96af704c7ea2c
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
