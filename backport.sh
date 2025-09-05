git reset HEAD~1
rm ./backport.sh
git cherry-pick 7e0f54bb73b2df96f0656f21a2d942108d026887
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
