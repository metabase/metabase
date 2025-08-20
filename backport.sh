git reset HEAD~1
rm ./backport.sh
git cherry-pick 7c979921b5e0c6712c0c0299d06cb1c0bea2de2f
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
