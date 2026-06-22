git reset HEAD~1
rm ./backport.sh
git cherry-pick cea403df68f84d06f05297595c48edf8b47aa33d
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
