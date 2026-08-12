git reset HEAD~1
rm ./backport.sh
git cherry-pick c30815f9107d026a07271ba6d7228f8569edc960
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
