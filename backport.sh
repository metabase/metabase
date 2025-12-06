git reset HEAD~1
rm ./backport.sh
git cherry-pick 5ae2e6d58602445e68e558696bd1d3b011e1d1e5
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
