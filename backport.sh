git reset HEAD~1
rm ./backport.sh
git cherry-pick ecfa6ea92028ad73c74e7c46ab9dd6d5919070a1
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
