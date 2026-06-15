git reset HEAD~1
rm ./backport.sh
git cherry-pick e860f98a4348486ad1f318c8714e5b7db668ce29
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
