# Upgrade guides

One file per contract-version upgrade, named `v<N>-to-v<N+1>.md`, written from
`../upgrade-guide-template.md` when Metabase bumps the data-app contract version.

The highest `<N+1>` here is the version this skill migrates to. No files means
the current version is 1 and there is nothing to migrate yet. Upgrades are never
skipped: an app at version 1 migrating to version 4 applies `v1-to-v2.md`,
`v2-to-v3.md`, then `v3-to-v4.md`, in that order, with one commit each.
