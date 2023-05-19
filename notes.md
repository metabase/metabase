Main workflow: `uberjar`

Depends on:
- `prepare-backend`
- `prepare-frontend`
- `prepare-uberjar-artifact`

Should upload to GitHub container registry.

https://docs.github.com/en/packages/managing-github-packages-using-github-actions-workflows/publishing-and-installing-a-package-with-github-actions


- :only metabase.query-processor-test.timezones-test
- metabase.query-processor-test.date-time-zone-functions-test/datetime-diff-base-test

DRIVERS=starburst clojure -X:dev:drivers:drivers-dev:test
