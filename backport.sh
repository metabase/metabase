git reset HEAD~1
rm ./backport.sh
git cherry-pick 62c29ab1eba22236548e3e190e9600c44cfa61c0
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
