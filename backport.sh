git reset HEAD~1
rm ./backport.sh
git cherry-pick c78c9fed48b3793bcf2589106a8f77bb5acf3c75
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
