git reset HEAD~1
rm ./backport.sh
git cherry-pick 8f92d99055f1516c0fea1df7c6c6e0735f90c316
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
