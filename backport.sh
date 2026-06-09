git reset HEAD~1
rm ./backport.sh
git cherry-pick 530bae6edc8b55ea0d239173ef8d0173a2aa66de
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
