git reset HEAD~1
rm ./backport.sh
git cherry-pick 2b9a4b6f9e426364584a2f9cebc4f9231ce47a07
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
