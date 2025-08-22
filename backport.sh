git reset HEAD~1
rm ./backport.sh
git cherry-pick 431cbbc6c35d66ecda7fbdc806728c675a718708
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
