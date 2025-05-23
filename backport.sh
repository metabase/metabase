git reset HEAD~1
rm ./backport.sh
git cherry-pick 5a638013b4a0c1cdbc2b9527c937e9e4249bebe6
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
