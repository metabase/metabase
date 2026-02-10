---
title: Metabase release versioning
---

# Metabase release versioning

We follow our own flavor of the [semantic versioning guidelines](https://semver.org/). Standard semantic versioning uses `Major.Minor.Patch` format, but we've adapted it to distinguish the [open-source version](https://www.metabase.com/product/starter) of Metabase from the paid, source-available version of Metabase (available in the [Pro](https://www.metabase.com/product/pro) and [Enterprise](https://www.metabase.com/product/enterprise) plans).

With Metabase releases, we prefix the version with a `0` or `1`, depending on the license.

## The Metabase version schema

```
License.Major.Point.Hotfix
```

For example:

```
v0.57.3.1
```

`v0.57.3.1` would be for a hotfix (`1`) for the third (`3`) point release of Metabase `57`, the open-source edition (`0`).

### License

- `0` for the free, open-source version (sometimes called OSS, for open-source software).
- `1` for the paid, source-available version that has all the bells and whistles (sometimes called EE for "Enterprise Edition").

### Major

We release major versions when we introduce new features or breaking changes. See [release announcements](https://www.metabase.com/releases).

### Point

Sometimes called a minor release, we issue point releases when we add bug fixes and refinements to existing features. See the [changelog](https://www.metabase.com/changelog)

### Hotfix

Sometimes called a patch release, we issue these releases nightly so we can fix bugs or security issues as soon as we can.

You'll see releases ending as `.x` in [releases on GitHub](https://github.com/metabase/metabase/releases). These are placeholder links. The actual link will go to the latest hotfix. For example:

- `metabase/metabase:v0.57.2.x` will automatically pull the latest patch version in for the latest minor version (like `v0.57.2.1`, `v0.57.2.2`, etc.).

## Other release terms

### The beta release

The beta release is the beta release of a new major version of Metabase. So for Metabase version 57, the gold releases would be:

- `v0.57.0` (the OSS version)
- `v1.57.0` (the EE version)

### The gold release

The gold release is the first stable release of a new major version of Metabase. So for Metabase version 57, the gold releases would be:

- `v0.57.1` (the OSS version)
- `v1.57.1` (the EE version)

### Cloud builds

If you see a version followed by an `-X`, like `v1.56.2-X01`, these are version numbers related to builds for customers on [Metabase Cloud](https://www.metabase.com/cloud/).

## Further reading

- [Metabase releases on GitHub](https://github.com/metabase/metabase/releases)
- [Metabase release blog posts](https://www.metabase.com/releases)
