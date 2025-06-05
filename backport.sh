git reset HEAD~1
rm ./backport.sh
git cherry-pick cb519789e7b7aa8685084cc68d794d3689dbef7c
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
