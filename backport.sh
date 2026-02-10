git reset HEAD~1
rm ./backport.sh
git cherry-pick d77f52936e4593a7f71ebfbe6bc192c144c8086f
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
