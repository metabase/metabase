git reset HEAD~1
rm ./backport.sh
git cherry-pick 05105be4c73bf4d1785c21f0b11b1412cfb21132
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
