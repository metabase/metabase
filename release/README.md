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

## GitHub action-less release

> **Note**
> Use this only if for some reason the automated release in CI is not available.

1. Copy the `.env-template` file to `.env` and fill in all environment variables
2. Run `cd release && bun install && bun run release-offline v0.77.77 1234567890abcdef1234567890abcdef12345678 --build`
3. Wait for the build and test jobs to finish
4. Test the built jar locally: `MB_JETTY_PORT=3033 java --add-opens java.base/java.nio=ALL-UNNAMED -jar target/uberjar/metabase.jar`
5. If everything is successful, run `bun run release-offline v0.77.77 1234567890abcdef1234567890abcdef12345678 --publish`

You can also run publish steps in isolation using these flags instead of `--publish`

- `--check-jar`
- `--s3`
- `--docker`
- `--version-info`
- `--tag`
- `--release-notes`

Alternatively, you can put any properly built jar in `target/uberjar` folder and run the publish script from there.

See also: [Tutorial Video](https://www.loom.com/share/a56f5a6904ff4f48acaa021846c90aeb)

## Totally GitHub-less release

If GitHub goes down completely :fire:, you can still build and publish a release to s3 and dockerhub from a local machine. Because we cannot use github to determine whether this release is a "latest" release, we must manually set that option on the command line.

The build step will be exactly the same as the with-github github-action-less release, but the publish step will be different:

```
bun run release-offline v0.77.77 1234567890abcdef1234567890abcdef12345678 --publish --without-github --not-latest
```
or
```
bun run release-offline v0.77.77 1234567890abcdef1234567890abcdef12345678 --publish --without-github --latest
```

The order of the arguments matters, the script will yell at you if you put the flags in the wrong order. We could make this more robust, but it's probably not worth the effort since hopefully we won't ever have to use this :crossed_fingers:.

## Utilities

In case you want to preview release notes generation, or re-generate them after a release has been built, you can use this command.

```sh
bun run generate-changelog v0.77.0 > changelog.log
```
