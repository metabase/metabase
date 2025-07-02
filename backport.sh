git reset HEAD~1
rm ./backport.sh
git cherry-pick 4b39657797442ba4de0963d077900c7671edb85d
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
