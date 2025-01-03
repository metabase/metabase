---
title: Embedded analytics SDK - versions
---

# Embedded analytics SDK - versions

{% include beta-blockquote.html %}

{% include plans-blockquote.html feature="Embedded analytics SDK" sdk=true %}

The SDK stable version tracks with the Metabase version.

So, for example, if you're on Metabase 51 (`0.51.x`, `1.51.x`), _any_ version 0.51.x of the @metabase/embedding-sdk-react npm package will be compatible.

To simplify things, we publish dist-tags for each stable Metabase version, starting from Metabase 51,`51-stable`. To install the latest version of the SDK compatible with Metabase 51, run:

```sh
npm install @metabase/embedding-sdk-react@51-stable
```

To grab the latest version of the SDK that works with Metabase nightly builds, use the `canary` dist-tag.

## Version pinning when using the SDK with Metabase Cloud

To pin your version of Metabase, go to **Admin settings > Settings > Embedding**. Go to the Embedded analytics SDK card and scroll to **Version pinning** and click **Request version pinning**.

## Version pinning requirements

To pin a version of Metabase, you must:

- Be on Metabase Cloud (obviously)
- Be on the Pro or Enterprise plans

## Why you'd want to pin your Metabase Cloud version

Normally, Metabase Cloud upgrades your Metabase as new versions roll out so that you don't have to deal with upgrades.

But if you're using the SDK with Metabase Cloud, you'll want to upgrade manually to make sure your embeds don't break when you upgrade both your Metabase and your SDK version.

To upgrade manually, you can pin your Metabase version so that it stays in sync with the SDK version you're using. You can choose when to upgrade your Metabase.
