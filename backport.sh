git reset HEAD~1
rm ./backport.sh
git cherry-pick f94fc5541876b510fd5533c62bdcbcebd2b8c612
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
