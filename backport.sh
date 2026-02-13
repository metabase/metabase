git reset HEAD~1
rm ./backport.sh
git cherry-pick c55a5d23a126da385f033701bbe5dc1f3943076c
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
