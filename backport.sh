git reset HEAD~1
rm ./backport.sh
git cherry-pick 37b72f94e44ddc61cc7fab484c7978532a42fdde
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
