---
title: Custom visualizations in embeds
summary: Enable custom visualizations in your embeds by adding them to your allowlist.
---

# Custom visualizations in embeds

{% include plans-blockquote.html feature="Custom visualizations" %}

Authenticated [modular embeds](./modular-embedding.md) can render [custom visualizations](../questions/visualizations/custom.md), whether you're embedding with web components or with the [React SDK](./sdk/introduction.md).

Before an embed can render a custom visualization, an admin will need to [turn on custom visualizations](../questions/visualizations/custom.md#enabling-custom-visualizations) in your Metabase and upload the visualization. To develop a custom visualization, see [Building custom visualizations](../developers-guide/custom-visualizations.md).

## Add custom visualizations to your allowlist

Embeds don't load custom visualizations by default. You have to list each visualization you want, so that a custom visualization someone adds to your Metabase doesn't automatically start showing up in your app.

### Web components

Add `allowedCustomVisualizations` to `defineMetabaseConfig()`:

```html
<!-- Load embedding library -->
<!-- REPLACE WITH YOUR METABASE URL HERE -->
<script defer src="https://your-metabase-url/app/embed.js"></script>

<!-- Embedding configuration -->
<script>
  function defineMetabaseConfig(config) {
    window.metabaseConfig = config;
  }
</script>

<script>
  defineMetabaseConfig({
    instanceUrl: "https://your-metabase-url",
    allowedCustomVisualizations: ["custom:Calendar Heatmap", "custom:Thumbs"],
  });
</script>

<metabase-dashboard dashboard-id="1"></metabase-dashboard>
```

`allowedCustomVisualizations` is a [page-level config](./modular-embedding.md#page-level-config), not an attribute on `<metabase-dashboard>` or `<metabase-question>`. The allowlist applies to every component on the page.

If you create your embed through the [embed wizard](./modular-embedding.md#create-a-new-embed), Metabase fills in the allowlist with the custom visualizations that the dashboard or question you picked already uses, so the generated snippet works as-is.

### React SDK

Pass the `allowedCustomVisualizations` prop to `MetabaseProvider`:

```typescript
{% include_file "{{ dirname }}/sdk/snippets/config/config-with-custom-visualizations.tsx" snippet="example" %}
```

## Each name in the allowlist needs a `custom:` prefix

Each entry is the custom visualization's name, prefixed with `custom:`. A custom visualization named `Calendar Heatmap` becomes `"custom:Calendar Heatmap"`.

The name comes from the `name` in the visualization's plugin manifest. You can look it up in your Metabase under **Admin** > **Settings** > **Custom visualizations** > **Manage visualizations**.

Names are case-sensitive, so `"custom:calendar heatmap"` won't match a visualization named `Calendar Heatmap`.

Any question that uses a custom visualization that isn't on the allowlist will fall back to the default visualization for that query's results. If an entry on your allowlist doesn't match an uploaded visualization, Metabase logs a warning to the browser console.

## Custom visualizations don't work in guest embeds

Custom visualizations only work when Metabase knows who's viewing the embed. [Guest embeds](./guest-embedding.md) ignore `allowedCustomVisualizations` (and log a warning to the console), and fall back to the default visualization.

Any embed with a signed-in person can load custom visualizations, including embeds you're previewing locally with an API key or your existing Metabase session. See [Authentication](./authentication.md).

Custom visualizations also don't render in [public links](./public-links.md) or [dashboard subscriptions and alerts](../questions/alerts.md).

## Only allowlist visualizations you trust

A custom visualization runs third-party JavaScript in your app. Metabase runs that code in an isolated sandbox, so a visualization can't reach the rest of your app or make network requests. The sandbox doesn't block passive image loads, though: a visualization can still trigger outbound requests through `<img>` tags or CSS `url()`.

### Set a Content Security Policy in your app

To limit where custom visualizations can load images from, set a Content Security Policy with an `img-src` allowlist in your app. The core Metabase app sets this CSP with [Restrict image domains](../configuring-metabase/settings.md#restrict-image-domains), but you should also set a CSP in your app.

See also [Only add visualizations you trust](../questions/visualizations/custom.md#only-add-visualizations-you-trust).

## Further reading

- [Custom visualizations](../questions/visualizations/custom.md)
- [Building custom visualizations](../developers-guide/custom-visualizations.md)
- [Modular embedding](./modular-embedding.md)
- [Modular embedding components](./components.md)
