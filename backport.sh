git reset HEAD~1
rm ./backport.sh
git cherry-pick d5fea3a9a063ff3a93a10cabaf04d47119b3c4a2
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
