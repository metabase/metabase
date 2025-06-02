git reset HEAD~1
rm ./backport.sh
git cherry-pick fcef77fdef7af7ac7fac2333d9800109ad8e0070
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
