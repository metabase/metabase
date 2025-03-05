---
title: Embedded analytics SDK - versions
---

# Embedded analytics SDK - versions

{% include plans-blockquote.html feature="Embedded analytics SDK" sdk=true %}

The SDK stable version tracks with the Metabase version.

So, for example, if you're on Metabase 53 (`0.53.x`, `1.53.x`), _any_ version 0.53.x of the @metabase/embedding-sdk-react npm package will be compatible.

To simplify things, we publish dist-tags for each stable Metabase version. For example, to install the latest version of the SDK compatible with Metabase 53, run:

```sh
npm install @metabase/embedding-sdk-react@53-stable
```

To grab the latest version of the SDK that works with Metabase nightly builds, use the `canary` dist-tag.

## Minimum SDK version

52 is the minimum version supported for the Embedded analytics SDK.

## Version pinning when using the SDK with Metabase Cloud

To pin your version of Metabase, go to **Admin settings > Settings > Embedding**. Go to the Embedded analytics SDK card and scroll to **Version pinning** and click **Request version pinning**.

## Version pinning requirements

To pin a version of Metabase, you must:

- Be on Metabase Cloud (obviously)
- Be on the Pro or Enterprise plans

## Why you'd want to pin your Metabase Cloud version

Normally, Metabase Cloud upgrades your Metabase as new versions roll out so that you don't have to deal with upgrades.

But if you're using the SDK with Metabase Cloud, you'll want to upgrade manually to make sure your embeds don't break when you upgrade both your Metabase and your SDK version.

To upgrade manually, you can pin your Metabase version so that it stays in sync with the SDK version you're using. That way you can choose when to upgrade your Metabase.
