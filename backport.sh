git reset HEAD~1
rm ./backport.sh
git cherry-pick 2e33d53027ec1db51461ed9e28cf33c3ab752adc
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
