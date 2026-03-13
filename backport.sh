git reset HEAD~1
rm ./backport.sh
git cherry-pick b773f68f23ee58289665abd71b8fa54082c773e2
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
