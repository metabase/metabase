git reset HEAD~1
rm ./backport.sh
git cherry-pick 336000805358e9664fa84df88093920b37b661dc
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
