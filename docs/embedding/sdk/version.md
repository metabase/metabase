---
title: Modular embedding SDK - versions
summary: Learn about Modular embedding SDK versioning and compatibility with Metabase. Install compatible versions and pin your Metabase Cloud instance version.
---

# Modular embedding SDK - versions

{% include plans-blockquote.html feature="Modular embedding SDK" sdk=true %}

## Metabase 57 and later

Starting with Metabase 57, the `@metabase/embedding-sdk-react` npm package loads the SDK Bundle from your Metabase.

To install the latest SDK Package:

```sh
npm install @metabase/embedding-sdk-react
```

Keeping the SDK Package version aligned with your Metabase version is **recommended** (you'll pick up bug fixes and new features as they ship), but it is not required.

If you'd rather pin to a specific Metabase major, we publish `@{major}-stable` dist-tags — for example, `@60-stable` for the latest SDK release built against Metabase 60:

```sh
npm install @metabase/embedding-sdk-react@60-stable
```

To grab the latest version of the SDK that works with Metabase nightly builds, use the `canary` dist-tag.

## Metabase 56 and earlier

For Metabase 56 and earlier, the SDK did not yet use the Package/Bundle split, so the SDK major version must match the Metabase major version. Use the matching `@{major}-stable` dist-tag — for example, for Metabase 55:

```sh
npm install @metabase/embedding-sdk-react@55-stable
```

On Metabase 55 (`0.55.x`, `1.55.x`), _any_ 0.55.x release of `@metabase/embedding-sdk-react` will be compatible.

## Minimum SDK version

Version 52 is the minimum version supported for the Modular embedding SDK.

## You can pin instances to a version on Metabase Cloud

Metabase Cloud upgrades your instance automatically as new versions roll out. If you're using the SDK with Metabase Cloud, you may want to pin your version so you can upgrade manually.

On Metabase 56 or earlier, pinning also keeps the SDK Package and Metabase majors in lockstep.

### Manually pinning your instance version on Metabase Cloud

To manually pin your version of Metabase:

1. Go to **Admin > Embedding > Modular**.
2. Scroll to **Version pinning** and click **Request version pinning**.

This will open a mailto link to our support team.
