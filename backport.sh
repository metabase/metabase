git reset HEAD~1
rm ./backport.sh
git cherry-pick 84a9434f08a35955ea3daea18a342e5f0fafd767
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
