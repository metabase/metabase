git reset HEAD~1
rm ./backport.sh
git cherry-pick eacd80a882d52efd33d5094e16d5f9757443b745
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
