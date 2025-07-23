git reset HEAD~1
rm ./backport.sh
git cherry-pick c3dbced1910abff3920659880ce4f0a05f0758ae
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
