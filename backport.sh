git reset HEAD~1
rm ./backport.sh
git cherry-pick 3b49b1a92be0e33f12dc10fa4999926ff20cec12
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
