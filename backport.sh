git reset HEAD~1
rm ./backport.sh
git cherry-pick a77339d049fad7799b082b4b7fe943e51b9e01e3
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
