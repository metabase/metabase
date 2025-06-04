git reset HEAD~1
rm ./backport.sh
git cherry-pick 519a9f197fc8eeb0cd6f69426a789ed24e312083
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
