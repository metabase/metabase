git reset HEAD~1
rm ./backport.sh
git cherry-pick 94b9737f0b4323cef454a60754e96b1600b2239e
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
