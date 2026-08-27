git reset HEAD~1
rm ./backport.sh
git cherry-pick 31e8463f0f76238c40c6da9467467557c1fd1100
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
