git reset HEAD~1
rm ./backport.sh
git cherry-pick e180cb1e868663da6990e4f28d6c9438413e0f25
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
