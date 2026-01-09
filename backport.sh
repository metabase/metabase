git reset HEAD~1
rm ./backport.sh
git cherry-pick 363baef1d937078ecc1efe9710cbe883f830c819
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
