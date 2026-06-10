git reset HEAD~1
rm ./backport.sh
git cherry-pick e54f13d3ea48cae6aca24172fd551061102ba0d0
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
