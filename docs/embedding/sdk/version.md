---
title: Modular embedding SDK - versions
summary: Learn about Modular embedding SDK versioning and compatibility with Metabase. Install compatible versions and pin your Metabase Cloud instance version.
---

# Modular embedding SDK - versions

{% include plans-blockquote.html feature="Modular embedding SDK" sdk=true %}

The SDK stable version tracks with the Metabase version.

So, for example, if you're on Metabase 56 (`0.56.x`, `1.56.x`), _any_ version 0.56.x of the @metabase/embedding-sdk-react npm package will be compatible.

To simplify things, we publish dist-tags for each stable Metabase version. For example, to install the latest version of the SDK compatible with Metabase 56, run:

```sh
npm install @metabase/embedding-sdk-react@56-stable
```

To grab the latest version of the SDK that works with Metabase nightly builds, use the `canary` dist-tag.

## Minimum SDK version

Version 52 is the minimum version supported for the Modular embedding SDK.

## You can pin instances to a version on Metabase Cloud

Metabase Cloud upgrades your instance automatically as new versions roll out. But if you're using the SDK with Metabase Cloud, you may want to pin your version so you can upgrade manually. This way you can make sure that your embeds don't break when you upgrade both your Metabase and your SDK version.

### Manually pinning your instance version on Metabase Cloud

To manually pin your version of Metabase:

1. Go to **Admin > Embedding > Modular**.
2. Scroll to **Version pinning** and click **Request version pinning**.

This will open a mailto link to our support team.
