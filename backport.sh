git reset HEAD~1
rm ./backport.sh
git cherry-pick 66118921ecc9b53f50bc5a3453020595454e24a4
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
