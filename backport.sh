git reset HEAD~1
rm ./backport.sh
git cherry-pick fb5bfdcb7f48f90dd2c091b30de3952f070dd461
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
