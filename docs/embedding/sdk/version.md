---
title: Embedded analytics SDK - versions
---

# Embedded analytics SDK - versions

{% include plans-blockquote.html feature="Embedded analytics SDK" sdk=true %}

The SDK stable version tracks with the Metabase version.

So, for example, if you're on Metabase 55 (`0.55.x`, `1.55.x`), _any_ version 0.55.x of the @metabase/embedding-sdk-react npm package will be compatible.

To simplify things, we publish dist-tags for each stable Metabase version. For example, to install the latest version of the SDK compatible with Metabase 55, run:

```sh
npm install @metabase/embedding-sdk-react@55-stable
```

To grab the latest version of the SDK that works with Metabase nightly builds, use the `canary` dist-tag.

## Minimum SDK version

Version 52 is the minimum version supported for the Embedded analytics SDK.

## Instances on Metabase Cloud will be pinned to a specific version

By default, if you're running on Metabase Cloud and using the Embedded analytics SDK, we'll pin your version to avoid breaking changes. 

Normally, Metabase Cloud upgrades your Metabase as new versions roll out so you don't have to deal with upgrades. But if you're using the SDK with Metabase Cloud, you'll want to upgrade manually to make sure your embeds don't break when you upgrade both your Metabase and your SDK version.

### Manually pinning your instance version on Metabase Cloud

To manually pin your version of Metabase:

1. Go to **Admin settings > Settings > Embedding**.
2. Go to the Embedded analytics SDK card.
3. Scroll to **Version pinning** and click **Request version pinning**.

This will open a mailto link to our support team.