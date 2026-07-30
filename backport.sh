git reset HEAD~1
rm ./backport.sh
git cherry-pick 70c3f15684d4914796908cf74f8c0fda70deb24f
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
