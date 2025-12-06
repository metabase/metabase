git reset HEAD~1
rm ./backport.sh
git cherry-pick f6937a70212061d4799ea688d1816f2d0810da5d
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
