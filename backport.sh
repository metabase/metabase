git reset HEAD~1
rm ./backport.sh
git cherry-pick 9a0e2293706a05272cc25c69f20e91cf01ad27cc
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
