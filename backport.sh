git reset HEAD~1
rm ./backport.sh
git cherry-pick 0234ce1061101f820141837d5139a03beecd88b9
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
