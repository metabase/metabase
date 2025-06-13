git reset HEAD~1
rm ./backport.sh
git cherry-pick 876368b12d6ce68c1bb12cfb40f838d2843ca4e1
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
