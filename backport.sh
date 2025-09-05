git reset HEAD~1
rm ./backport.sh
git cherry-pick f4d3359e33bf1f92912e2039f945acbb397d47d5
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
