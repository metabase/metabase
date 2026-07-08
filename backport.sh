git reset HEAD~1
rm ./backport.sh
git cherry-pick 851cb65a11b87b2693512f1293066e7ff5e4634f
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
