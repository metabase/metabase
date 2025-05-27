git reset HEAD~1
rm ./backport.sh
git cherry-pick 98e1166ea0492732c6f4c76e12d83c1329a740bb
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
