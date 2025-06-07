git reset HEAD~1
rm ./backport.sh
git cherry-pick 6e3aca9d5aa9587e99585f4ebef254290fcf76c0
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
