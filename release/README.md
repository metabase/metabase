# Metabase Release

There are 3 ways to release

- Automated Release in CI
- Release from a local environment
- Release from a local environment without github

## Automated Release

1. Find the commit hash that you want to release
2. Run the "build-for-release" action on github actions, inputting the version and commit hash (always select the master branch)
3. Wait for the build and test jobs to finish
4. If everything is successful, run the "release" action on github actions, inputting the version and commit hash again (always select the master branch)

## Github action-less release

> **Note**
> Use this only if for some reason the automated release in CI is not available.

1. Copy the `.env-template` file to `.env` and fill in all environment variables
2. Run `cd release && yarn && yarn release-offline v0.77.77 1234567890abcdef1234567890abcdef12345678 --build`
3. Wait for the build and test jobs to finish
4. Test the built jar locally: `MB_JETTY_PORT=3033 java -jar target/uberjar/metabase.jar`
5. If everything is successful, run `yarn release-offline v0.77.77 1234567890abcdef1234567890abcdef12345678 --publish`

You can also run publish steps in isolation using these flags instead of `--publish`

- `--check-jar`
- `--s3`
- `--docker`
- `--version-info`
- `--tag`
- `--release-notes`

Alternatively, you can put any properly built jar in `target/uberjar` folder and run the publish script from there.

See also: [Tutorial Video](https://www.loom.com/share/a56f5a6904ff4f48acaa021846c90aeb)

## Totally github-less release

Coming soon?
