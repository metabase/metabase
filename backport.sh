git reset HEAD~1
rm ./backport.sh
git cherry-pick d7848ee998575b1a44ab27b89dae8381a760eaa6
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
