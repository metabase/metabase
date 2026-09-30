---
title: Configure your embeds
summary: "Set the configuration that all modular embeds on a page share, including your Metabase URL, language, and authentication mode, with web components or the React SDK."
redirect_from:
  - /docs/latest/embedding/sdk/config
---

# Configure your embeds

Every modular embed on a page shares one configuration. How you configure your embeds depends on which embedding method you use:

- **[Web components](#configure-web-components)**: call `defineMetabaseConfig()` once per page. All Metabase components on the page use that config.
- **[React SDK](#configure-the-react-sdk)**: pass your config as props to `MetabaseProvider`. All Metabase components inside the provider use that config.

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
    instanceUrl: "https://your-metabase.example.com",
  });
</script>

<metabase-dashboard dashboard-id="1"></metabase-dashboard>
```

`instanceUrl`, the URL of your Metabase, is the only required setting.

For the full list of settings, see [web component settings](./config-reference.md#web-component-definemetabaseconfig-settings).

## Configure the React SDK

{% include plans-blockquote.html feature="Modular embedding SDK" sdk=true convert_pro_link_to_embedding=true %}

To configure the [React SDK](./sdk/introduction.md), pass your config as props to `MetabaseProvider`. The only required prop is `authConfig`, which you create with `defineMetabaseAuthConfig()`:

```tsx
{% include_file "{{ dirname }}/sdk/snippets/config/config-base.tsx" %}
```

For the full list of props, see [`MetabaseProvider` props](./config-reference.md#react-sdk-metabaseprovider-props).

## Set how your embeds authenticate

Your config determines how every embed on the page authenticates:

- **[Guest embeds](./introduction.md#components-with-guest-authentication)**: view-only. Your server signs a token for each embed, so people don't need Metabase accounts. See [Configure a guest embed](#configure-a-guest-embed).
- **[SSO embeds](./introduction.md#components-with-sso-authentication)**: the default. Your app signs each person in to their own Metabase account, so their permissions apply. See [Configure an SSO embed](#configure-an-sso-embed).

You can only use one type of authentication per page. To pick one, check out [SSO or guest embeds](./introduction.md#comparison-between-sso-and-guest-authentication).

### Configure a guest embed

To configure guest embeds, set `isGuest: true`, which tells the components to authenticate with a signed JWT instead of a Metabase session. Where the setting goes depends on how you're embedding.

With web components, add `isGuest` to the page-level config. You can also add `guestEmbedProviderUri`, which points to the endpoint in your app that signs the tokens:

```html
<script>
  defineMetabaseConfig({
    instanceUrl: "https://your-metabase.example.com",
    isGuest: true,
    guestEmbedProviderUri: "/api/metabase-guest-token",
  });
</script>
```

The embed calls the endpoint for a token on load, and again when the current token expires. Without `guestEmbedProviderUri`, your server must generate a token for each component and set the token in that component's `token` attribute when building the page.

With the SDK, add `isGuest` to your auth config, and pass each component a token that your server signs. The SDK doesn't support `guestEmbedProviderUri`.

```tsx
{% include_file "{{ dirname }}/sdk/snippets/config/config-with-guest-auth.tsx" snippet="example" %}
```

Either way, you'll need to publish each item you want to embed. For publishing and the server-side code, see [guest embedding](./guest-embedding.md).

### Configure an SSO embed

Embeds use SSO unless you set `isGuest`, so there's no setting to turn SSO on. You'll need to [set up SSO in your Metabase and your app](./authentication.md).

To customize how embeds fetch the JWT, set `fetchRequestToken` in `defineMetabaseConfig()` (web components) or `defineMetabaseAuthConfig()` (SDK). See [customizing JWT authentication](./authentication.md#customizing-jwt-authentication).

### Preview embeds during development

To preview embeds without setting up authentication, use your own Metabase session or an API key. Both are for development only.

- **Use your existing session (web components only)**: in `defineMetabaseConfig()`, set `useExistingUserSession: true`. The embed renders using your Metabase session. Only supported in Google Chrome.
- **Use an API key**: set `apiKey` in `defineMetabaseConfig()` (web components) or `defineMetabaseAuthConfig()` (SDK). Only works on localhost. See [authenticating locally with API keys](./authentication.md#authenticating-locally-with-api-keys).

## Set the language

To set the display language for every embed, add a `locale` with an ISO language code. The locale defaults to your Metabase instance's locale.

Setting a locale translates Metabase's UI, like menus and filter widgets. It doesn't translate content you create, like dashboard names and filter labels. To translate your content, upload a [translation dictionary](./translations.md).

- [Web component](#web-component-locale)
- [React SDK](#react-sdk-locale)

### Web component locale

Add `locale` to the page-level config:

```html
<script>
  defineMetabaseConfig({
    instanceUrl: "https://your-metabase.example.com",
    locale: "de",
  });
</script>
```

### React SDK locale

Pass `locale` to `MetabaseProvider`:

```tsx
{% include_file "{{ dirname }}/sdk/snippets/config/config-with-locale.tsx" snippet="example" %}
```

## Set a theme

To customize colors and fonts for every embed, add a `theme` object. The theme object is the same for web components and the SDK. For all the theme options, see [Appearance](./appearance.md).

- [Web component](#web-component-theme)
- [React SDK](#react-sdk-theme)

### Web component theme

Add `theme` to the page-level config:

```html
<script>
  defineMetabaseConfig({
    instanceUrl: "https://your-metabase.example.com",
    theme: {
      colors: {
        brand: "#509EE3",
      },
    },
  });
</script>
```

### React SDK theme

Create a theme with `defineMetabaseTheme()` and pass it to `MetabaseProvider`:

```tsx
{% include_file "{{ dirname }}/sdk/snippets/config/config-with-theme.tsx" snippet="example" %}
```

## Configure plugins

To customize the behavior of embedded components, add plugins with `pluginsConfig`. Plugins you set in the shared config apply to every embed.

- [Web component](#web-component-plugins)
- [React SDK](#react-sdk-plugins)

### Web component plugins

Web components support one plugin, [`handleLink`](./sdk/plugins.md#handlelink), which customizes what happens when people click a link in an embed. Add `pluginsConfig` to the page-level config:

```html
<script>
  defineMetabaseConfig({
    instanceUrl: "https://your-metabase.example.com",
    pluginsConfig: {
      handleLink: (urlString) => {
        const url = new URL(urlString, window.location.origin);
        if (url.origin === window.location.origin) {
          // Handle the link yourself, like with your app's router
          return { handled: true };
        }
        return { handled: false }; // Open the link in a new tab
      },
    },
  });
</script>
```

### React SDK plugins

Pass `pluginsConfig` to `MetabaseProvider`:

```tsx
{% include_file "{{ dirname }}/sdk/snippets/config/config-with-plugins.tsx" snippet="example" %}
```

SDK components also take their own `plugins` prop, which overrides the global config.

For available plugins and their APIs, see [plugins](./sdk/plugins.md).

## Allow custom visualizations

To render [custom visualizations](../questions/visualizations/custom.md) in your embeds, add the `allowedCustomVisualizations` allowlist to `defineMetabaseConfig()` (web components) or pass it to `MetabaseProvider` (SDK).

Custom visualizations require SSO. Guest embeds ignore the allowlist and show the default visualization instead.

For examples and the naming rules, see [custom visualizations in embeds](./custom-visualizations.md).

## Handle embed events (React SDK only)

To run your own code when embeds load, like sending analytics events, pass an `eventHandlers` object to `MetabaseProvider`. There's no web component equivalent.

```tsx
{% include_file "{{ dirname }}/sdk/snippets/config/config-with-event-handlers.tsx" snippet="example" %}
```

`onDashboardLoad` fires when a dashboard loads with all visible cards and their content.

For the full list of handlers, see [`eventHandlers`](./config-reference.md#react-sdk-eventhandlers).

## Customize loading and error states (React SDK only)

To replace the SDK's default loading and error screens, pass `loaderComponent` and `errorComponent` to `MetabaseProvider`. There's no web component equivalent. See [Customize loading, error, and empty states](./sdk/loading-and-errors.md).

## Reload a component (React SDK only)

Metabase components don't detect your app's data changes. To reload an embed after your app's data changes, change the component's `key` prop:

```tsx
{% include_file "{{ dirname }}/sdk/snippets/config/reload-metabase-provider.tsx" snippet="example" %}
```

## Further reading

- [Config reference](./config-reference.md)
- [Appearance](./appearance.md)
- [Authentication](./authentication.md)
- [Guest embedding](./guest-embedding.md)
- [Translating embeds](./translations.md)
- [Custom visualizations in embeds](./custom-visualizations.md)
- [Modular embedding components](./components.md)
- [Modular embedding SDK](./sdk/introduction.md)
