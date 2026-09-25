---
title: Configure your embeds
summary: "Set the configuration that all modular embeds on a page share, including your Metabase URL, language, and authentication mode."
redirect_from:
  - /docs/latest/embedding/sdk/config
---

# Configure your embeds

Every modular embed on a page shares one configuration. How you configure your embeds depends on which embedding method you use:

- **Web components**: call `defineMetabaseConfig()` once per page. All Metabase components on the page use that config.
- **React SDK**: pass your config as props to `MetabaseProvider`. All Metabase components inside the provider use that config.

Settings for one embed, like a dashboard's ID, go on the component. Settings for every embed, like your Metabase URL or theme, go in the shared configuration.

## Configure web components

To configure web components, add a script tag to your page that loads `embed.js` from your Metabase, then call `defineMetabaseConfig()`:

```html
<!-- embed.js defines <metabase-dashboard> and other elements -->
<script defer src="https://your-metabase.example.com/app/embed.js"></script>
<script>
function defineMetabaseConfig(config) {
  window.metabaseConfig = config;
}
</script>

<script>
  defineMetabaseConfig({
    "isGuest": true,
    "instanceUrl": "https://your-metabase.example.com",
    "guestEmbedProviderUri": "/api/metabase-guest-token"
  });
</script>

<metabase-dashboard dashboard-id="1"></metabase-dashboard>
```

`instanceUrl`, the URL of your Metabase, is the only required setting. This example is a [guest embed](#configure-guest-embeds).

For the full list of settings, see [config reference](./config-reference.md).

## Configure the React SDK

{% include plans-blockquote.html feature="Modular embedding SDK" sdk=true convert_pro_link_to_embedding=true %}

To configure the React SDK, pass your config as props to `MetabaseProvider`. The only required prop is `authConfig`, which you create with `defineMetabaseAuthConfig()`:

```typescript
import React from "react";
import {
  MetabaseProvider,
  defineMetabaseAuthConfig,
} from "@metabase/embedding-sdk-react";

const authConfig = defineMetabaseAuthConfig({
  metabaseInstanceUrl: "https://your-metabase.example.com", // Required
});

export default function App() {
  return (
    <MetabaseProvider authConfig={authConfig}>
      {/* Metabase components go here */}
    </MetabaseProvider>
  );
}
```

For the full list of props, see [`MetabaseProvider` props](./config-reference.md#react-sdk-metabaseprovider-props).

## Preview embeds during development

To preview embeds without setting up authentication, use your own Metabase session or an API key. Both work only in local development.

- **Use your existing session**: in `defineMetabaseConfig()`, set `useExistingUserSession: true`. The embed renders using your Metabase session. Only supported in Google Chrome.
- **Use an API key**: set `apiKey` to an API key from your Metabase. The SDK quickstart uses this method. Only works on localhost.

For production, set up [authentication](./authentication.md) or [guest embedding](./guest-embedding.md).

## Configure guest embeds

To configure guest embeds, add two settings to the page-level config:

- `isGuest: true` tells the components to authenticate with a signed JWT instead of a Metabase session.
- `guestEmbedProviderUri` points to the endpoint in your app that signs the tokens. The embed calls this endpoint for a token on load, and again when the current token expires. Without this setting, your server must generate a token for each component and set the token in that component's `token` attribute when building the page.

For the server-side code, see [guest embedding](./guest-embedding.md).

## Set the language

To set the display language for every embed, add a `locale` with an ISO language code. The locale defaults to your Metabase instance's locale.

Setting a locale translates Metabase's UI, like menus and filter widgets. It doesn't translate content you create, like dashboard names and filter labels. To translate your content, upload a [translation dictionary](./translations.md).

### Web component locale

Add `locale` to the page-level config:

```js
defineMetabaseConfig({
  "instanceUrl": "https://your-metabase.example.com",
  "locale": "de"
});
```

### React SDK locale

Pass `locale` to `MetabaseProvider`:

```tsx
<MetabaseProvider authConfig={authConfig} locale="de">
```

## Set a theme

To customize colors and fonts for every embed, add a `theme` object. For all the theme options, see [Appearance](./appearance.md).

### Web component theme

Add `theme` to the page-level config:

```js
defineMetabaseConfig({
  "instanceUrl": "https://your-metabase.example.com",
  "theme": {
    "colors": {
      "brand": "#509EE3"
    }
  }
});
```

### React SDK theme

Create a theme with `defineMetabaseTheme()` and pass it to `MetabaseProvider`:

```tsx
const theme = defineMetabaseTheme({
  colors: {
    brand: "#509EE3",
  }
});

<MetabaseProvider authConfig={authConfig} theme={theme}>
```

## Configure plugins

To customize the behavior of embedded components, add plugins. For web components, add a `pluginsConfig` object to the page-level config. For the SDK, pass `pluginsConfig` to `MetabaseProvider`:

```tsx
<MetabaseProvider
  authConfig={authConfig}
  pluginsConfig={{
    mapQuestionClickActions: () => [], // Add your custom actions here
  }}
>
```

Plugins you set this way apply to every embed. Components also take their own `plugins` prop, which overrides the global config.

For available plugins and their APIs, see [plugins](./sdk/plugins.md).

## Handle embed events (React SDK only)

To run your own code when embeds load, like sending analytics events, pass an `eventHandlers` object to `MetabaseProvider`:

```typescript
const handleDashboardLoad: SdkDashboardLoadEvent = (dashboard) => {
  // Send analytics events, show notifications, etc.
};

const eventHandlers = {
  onDashboardLoad: handleDashboardLoad,
  onDashboardLoadWithoutCards: handleDashboardLoad,
};

<MetabaseProvider authConfig={authConfig} eventHandlers={eventHandlers}>
```

- `onDashboardLoad` fires when a dashboard loads with all visible cards and their content.
- `onDashboardLoadWithoutCards` fires when the dashboard's title, tabs, and grid render, before the content loads.

## Customize loading and error states (React SDK only)

To replace the SDK's default loading and error screens, pass `loaderComponent` and `errorComponent` to `MetabaseProvider`:

```tsx
<MetabaseProvider
  authConfig={authConfig}
  loaderComponent={MyLoader}
  errorComponent={MyError}
>
```

## Allow custom visualizations

To render [custom visualizations](../questions/visualizations/custom.md) in your embeds, add the `allowedCustomVisualizations` allowlist. For web components, add the allowlist to the page-level config. For the SDK, pass it to `MetabaseProvider`:

```js
defineMetabaseConfig({
  "instanceUrl": "https://your-metabase.example.com",
  "allowedCustomVisualizations": ["custom:Calendar Heatmap", "custom:Thumbs"]
});
```

Custom visualizations require an authenticated embed. Guest embeds ignore the allowlist and show the default visualization instead.

For the full naming rules and the SDK example, see [custom visualizations in embeds](./custom-visualizations.md).

## Reload a component (React SDK only)

Metabase components don't detect your app's data changes. To reload an embed after your app's data changes, change the component's `key` prop:

```tsx
const [dataVersion, setDataVersion] = useState(0);

const saveOrder = async (order) => {
  await api.saveOrder(order); // Your app changes its data...
  setDataVersion(v => v + 1); // ...then changes the key, reloading the embed.
};

return <InteractiveQuestion key={dataVersion} questionId={yourQuestionId} />;
```

## Further reading

- [Config reference](./config-reference.md)
- [Appearance](./appearance.md)
- [Authentication](./authentication.md)
- [Guest embedding](./guest-embedding.md)
- [Translate embeds](./translations.md)
- [Custom visualizations](./custom-visualizations.md)
- [Modular embedding components](./components.md)