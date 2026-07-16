git reset HEAD~1
rm ./backport.sh
git cherry-pick 1f0d8d6b34d4d9a0eb5b7d946ce187354ffbf098
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
