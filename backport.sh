git reset HEAD~1
rm ./backport.sh
git cherry-pick 6cea29bace7587351cb8e9ad37729f53e03fed13
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
