git reset HEAD~1
rm ./backport.sh
git cherry-pick 821510a5c4235063b151f46e323b3a24212d8893
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
