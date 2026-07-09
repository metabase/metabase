git reset HEAD~1
rm ./backport.sh
git cherry-pick 950f4535352214917d906557afcb21b8d7e70627
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
