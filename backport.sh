git reset HEAD~1
rm ./backport.sh
git cherry-pick 0cad99631abcdbb174c0e0ae674aacd6dcf478bb
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
