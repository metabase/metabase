git reset HEAD~1
rm ./backport.sh
git cherry-pick a87f3e0defa183267376242ea2ad69cc96f28ede
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
