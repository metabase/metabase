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

Coming soon ...

## Totally github-less release

Coming soon...
