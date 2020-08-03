# Metabase Smoketests

These files exist to ensure that we can always do the things we expect with Metabase. :) 

## Running

From the root of the repository:

- If you are running tests that include admin_setup, run `python -m smtpd -n -c DebuggingServer localhost:1025`in terminal first for setting up email through your localhost

- If you already have built Metabase with `./bin/build`, just run this to run all the tests.

```shell
yarn run test-cypress-no-build --testFiles frontend/test/metabase-smoketest
```

- Active development, add `--open`