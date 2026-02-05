git reset HEAD~1
rm ./backport.sh
git cherry-pick a3e48f08679d513f96a209182c7a512a0ae53e00
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
