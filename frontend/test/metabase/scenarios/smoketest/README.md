# Metabase Smoketests

These files exist to ensure that we can always do the things we expect with Metabase. :)

## Running

From the root of the repository:

- If you already have built Metabase with `./bin/build`, just run this to run all the tests.

```shell
yarn run test-cypress-no-build --folder smoketest
```

- Active development, add `--open`
