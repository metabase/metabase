git reset HEAD~1
rm ./backport.sh
git cherry-pick 7948d6df58c5e57b025c7214ad37f1a43c0c46bd
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
