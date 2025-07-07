git reset HEAD~1
rm ./backport.sh
git cherry-pick e587fa357dc78704978328fca34340cf9dd51529
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
