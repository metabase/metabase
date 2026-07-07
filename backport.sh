git reset HEAD~1
rm ./backport.sh
git cherry-pick 01fa952fa71f4905c654395d1d584e075756f93e
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
