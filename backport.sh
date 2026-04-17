git reset HEAD~1
rm ./backport.sh
git cherry-pick cb67a8ff4768651b4c1076b33d7051a7e7f8cf83
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
