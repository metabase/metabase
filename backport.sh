git reset HEAD~1
rm ./backport.sh
git cherry-pick 63057ee4851df37c0e89a13fd1bc93f4b7f7ccff
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
