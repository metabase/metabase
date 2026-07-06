git reset HEAD~1
rm ./backport.sh
git cherry-pick 0605e0352f783fa557b5014bab57ed95338fb0ca
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
