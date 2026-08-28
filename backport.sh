git reset HEAD~1
rm ./backport.sh
git cherry-pick ed6247eb24f140e281188d0d02f46a867f4a7d29
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
