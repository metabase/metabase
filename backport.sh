git reset HEAD~1
rm ./backport.sh
git cherry-pick e6f72603219ea875e9f94955d5d81f27aa3d2211
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
