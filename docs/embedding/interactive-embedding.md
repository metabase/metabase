---
title: Interactive embedding
redirect_from:
  - /docs/latest/enterprise-guide/full-app-embedding
  - /docs/latest/embedding/full-app-embedding
---

# Interactive embedding

{% include plans-blockquote.html feature="Interactive embedding" convert_pro_link_to_embbedding=true %}

{% include shared/in-page-promo-embedding-workshop.html %}

**Interactive embedding** is what you want if you want to offer [multi-tenant, self-service analytics](https://www.metabase.com/learn/metabase-basics/embedding/multi-tenant-self-service-analytics).

Interactive embedding is the only type of embedding that integrates with your [permissions](../permissions/introduction.md) and [SSO](../people-and-groups/start.md#authentication) to give people the right level of access to [query](https://www.metabase.com/glossary/query-builder) and [drill-down](https://www.metabase.com/learn/metabase-basics/querying-and-dashboards/questions/drill-through) into your data.

## Interactive embedding demo

To get a feel for what you can do with interactive embedding, check out our [interactive embedding demo](https://www.metabase.com/embedding-demo).

To see the query builder in action, click on **Reports** > **+ New** > **Question**.

## Quick start

Check out the [Interactive embedding quick start](./interactive-embedding-quick-start-guide.md).

## Prerequisites for interactive embedding

1. Make sure you have a [license token](../installation-and-operation/activating-the-enterprise-edition.md) for a [Pro or Enterprise plan](https://store.metabase.com/checkout/login-details).
2. Organize people into Metabase [groups](../people-and-groups/start.md).
3. Set up [permissions](../permissions/introduction.md) for each group.
4. Set up [SSO](../people-and-groups/start.md#authentication) to automatically apply permissions and show people the right data upon sign-in. In general, **we recommend using [SSO with JWT](../people-and-groups/authenticating-with-jwt.md)**.

If you're dealing with a [multi-tenant](https://www.metabase.com/learn/metabase-basics/embedding/multi-tenant-self-service-analytics) situation, check out our recommendations for [Configuring permissions for different customer schemas](../permissions/embedding.md).

If you have your app running locally, and you're using the Pro Cloud version, or hosting Metabase and your app in different domains, you'll need to set your Metabase environment's session cookie samesite option to "none".

## Enabling interactive embedding in Metabase

1. Go to **Settings** > **Admin settings** > **Embedding**.
2. Click **Enable**.
3. Click **Interactive embedding**.
4. Under **Authorized origins**, add the URL of the website or web app where you want to embed Metabase (such as `https://*.example.com`).

## Setting up embedding on your website

1. Create an iframe with a `src` attribute set to:
   - the [URL](#pointing-an-iframe-to-a-metabase-url) of the Metabase page you want to embed, or
   - an [authentication endpoint](#pointing-an-iframe-to-an-authentication-endpoint) that redirects to your Metabase URL.
2. Optional: Depending on the way your web app is set up, set [environment variables](../configuring-metabase/environment-variables.md) to:
   - [Add your license token](../configuring-metabase/environment-variables.md#mb_premium_embedding_token).
   - [Embed Metabase in a different domain](#embedding-metabase-in-a-different-domain).
   - [Secure your interactive embed](#securing-interactive-embeds).
3. Optional: Enable communication to and from the embedded Metabase using supported [`postMessage`](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage) messages:
   - [From Metabase](#supported-postmessage-messages-from-embedded-metabase)
   - [To Metabase](#supported-postmessage-messages-to-embedded-metabase)
4. Optional: Set parameters to [show or hide Metabase UI components](#showing-or-hiding-metabase-ui-components).

Once you're ready to roll out your interactive embed, make sure that people **allow** browser cookies from Metabase, otherwise they won't be able to log in.

### Pointing an iframe to a Metabase URL

Go to your Metabase and find the page that you want to embed.

For example, to embed your Metabase home page, set the `src` attribute to your [site URL](../configuring-metabase/settings.md#site-url), such as:

```
src="http://metabase.yourcompany.com/"
```

To embed a specific Metabase dashboard, you'll want to use the dashboard's Entity ID URL `/dashboard/entity/[Entity ID]`.

```
src="http://metabase.yourcompany.com/dashboard/entity/[Entity ID]"
```

To get a dashboard's Entity ID, visit the dashboard and click on the **info** button. In the **Overview** tab, copy the **Entity ID**. Then in your iframe's `src` attribute to:

```
src=http://metabase.yourcompany.com/dashboard/entity/Dc_7X8N7zf4iDK9Ps1M3b
```

If your dashboard has more than one tab, select the tab you want people to land on and copy the Tab's ID. Add the tab's ID to the URL:

```
src=http://metabase.yourcompany.com/dashboard/entity/Dc_7X8N7zf4iDK9Ps1M3b?tab=YLNdEYtzuSMA0lqO7u3FD
```

You _can_ use a dashboard's sequential ID, but you should prefer the Entity ID, as Entity IDs are stable across different Metabase environments (e.g., if you're testing on a staging environment, the Entity IDs will remain the same when [exporting the data and importing it](../installation-and-operation/serialization.md) into a production environment).

If you want to point to a question, collection, or model, visit the item, click on its info, grab the item's Entity ID and follow the url structure: `/[Item type]/entity/[Entity-Id]`. Examples:

- `/collection/entity/[Entity ID]`
- `/model/entity/[Entity ID]`
- `/question/entity/[Entity ID]`

### Pointing an iframe to an authentication endpoint

Use this option if you want to send people directly to your SSO login screen (i.e., skip over the Metabase login screen with an SSO button), and redirect to Metabase automatically upon authentication.

You'll need to set the `src` attribute to your auth endpoint, with a `return_to` parameter pointing to the encoded Metabase URL. For example, to send people to your SSO login page and automatically redirect them to `http://metabase.yourcompany.com/dashboard/1`:

```
https://metabase.example.com/auth/sso?return_to=http%3A%2F%2Fmetabase.yourcompany.com%2Fdashboard%2F1
```

If you're using [JWT](../people-and-groups/authenticating-with-jwt.md), you can use the relative path for the redirect (i.e., your Metabase URL without the [site URL](../configuring-metabase/settings.md#site-url)). For example, to send people to a Metabase page at `/dashboard/1`:

```
https://metabase.example.com/auth/sso?jwt=<token>&return_to=%2Fdashboard%2F1
```

You must URL encode (or double encode, depending on your web setup) all of the parameters in your redirect link, including parameters for filters (e.g., `filter=value`) and [UI settings](#showing-or-hiding-metabase-ui-components) (e.g., `top_nav=true`). For example, if you added two filter parameters to the JWT example shown above, your `src` link would become:

```
https://metabase.example.com/auth/sso?jwt=<token>&redirect=%2Fdashboard%2F1%3Ffilter1%3Dvalue%26filter2%3Dvalue
```

## Cross-browser compatibility

To make sure that your embedded Metabase works in all browsers, put Metabase and the embedding app in the same top-level domain (TLD). The TLD is indicated by the last part of a web address, like `.com` or `.org`.

Note that your interactive embed must be compatible with Safari to run on _any_ browser in iOS (such as Chrome on iOS).

## Embedding Metabase in a different domain

> Skip this section if your Metabase and embedding app are already in the same top-level domain (TLD).

If you want to embed Metabase in another domain (say, if Metabase is hosted at `metabase.yourcompany.com`, but you want to embed Metabase at `yourcompany.github.io`), you can tell Metabase to set the session cookie's SameSite value to "none".

You can set session cookie's SameSite value in **Admin settings** > **Embedding** > **Interactive embedding** > **SameSite cookie setting**.

SameSite values include:

- **Lax** (default): Allows cookies to be sent when someone navigates to the origin site from an external site (like when following a link).
- **None**: Allows all cross-site requests. Incompatible with most Safari and iOS browsers, such as Chrome on iOS. If you set this environment variable to "None", you must use HTTPS in Metabase to prevent browsers from rejecting the request.
- **Strict** (not recommended): Never allows cookies to be sent on a cross-site request. Warning: this will prevent users from following external links to Metabase.

You can also set the [`MB_SESSION_COOKIE_SAMESITE` environment variable](../configuring-metabase/environment-variables.md#mb_session_cookie_samesite).

If you're using Safari, you'll need to [allow cross-site tracking](https://support.apple.com/en-tj/guide/safari/sfri40732/mac). Depending on the browser, you may also run into issues when viewing emdedded items in private/incognito tabs.

Learn more about [SameSite cookies](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie/SameSite).

## Securing interactive embeds

Metabase uses HTTP cookies to authenticate people and keep them signed into your embedded Metabase, even when someone closes their browser session. If you enjoy diagrammed auth flows, check out [Interactive embedding with SSO](./securing-embeds.md).

To limit the amount of time that a person stays logged in, set [`MAX_SESSION_AGE`](../configuring-metabase/environment-variables.md#max_session_age) to a number in minutes. The default value is 20,160 (two weeks).

For example, to keep people signed in for 24 hours at most:

```sh
MAX_SESSION_AGE=1440
```

To automatically clear a person's login cookies when they end a browser session:

```sh
MB_SESSION_COOKIES=true
```

To manually log someone out of Metabase, load the following URL (for example, in a hidden iframe on the logout page of your application):

```sh
https://metabase.yourcompany.com/auth/logout
```

If you're using [JWT](../people-and-groups/authenticating-with-jwt.md) for SSO, we recommend setting the `exp` (expiration time) property to a short duration (e.g., 1 minute).

## Supported postMessage messages _from_ embedded Metabase

To keep up with changes to an embedded Metabase URL (for example, when a filter is applied), set up your app to listen for "location" messages from the embedded Metabase. If you want to use this message for deep-linking, note that "location" mirrors "window.location".

```json
{
  "metabase": {
    "type": "location",
    "location": LOCATION_OBJECT_OR_URL
  }
}
```

To make an embedded Metabase page (like a question) fill up the entire iframe in your app, set up your app to listen for a "frame" message with "normal" mode from Metabase:

```json
{
  "metabase": {
    "type": "frame",
    "frame": {
      "mode": "normal"
    }
  }
}
```

To specify the size of an iframe in your app so that it matches an embedded Metabase page (such as a dashboard), set up your app to listen for a "frame" message with "fit" mode from Metabase:

```json
{
  "metabase": {
    "type": "frame",
    "frame": {
      "mode": "fit",
      "height": HEIGHT_IN_PIXELS
    }
  }
}
```

## Supported postMessage messages _to_ embedded Metabase

To change an embedding URL, send a "location" message from your app to Metabase:

```json
{
  "metabase": {
    "type": "location",
    "location": LOCATION_OBJECT_OR_URL
  }
}
```

## Group strategies with sandboxing

If you want multiple people from a single customer account to collaborate on questions and dashboards, you'll need to set up one [group](../people-and-groups/managing.md#groups) per customer account.

You can handle [data sandboxing](../permissions/data-sandboxes.md) with a single, separate group that just sandboxes your data. For example, each person could be part of a customer group that sets up data permissions with sandboxing via a certain attribute that applies to everyone across all your customer accounts.

Additionally, each person within a single customer account could also be a member of a group specific to that customer account. That way they can collaborate on collections with other people in their organization, without seeing stuff created by people from other customers' accounts.

## Showing or hiding Metabase UI components

See [interactive UI components](./interactive-ui-components.md)

## Reference apps

To build a sample interactive embed using SSO with JWT, see our reference apps:

- [Node.js + Express](https://github.com/metabase/metabase-nodejs-express-interactive-embedding-sample) (with [quick start guide](./interactive-embedding-quick-start-guide.md))
- [Node.js + React](https://github.com/metabase/sso-examples/tree/master/app-embed-example)

## Further reading

- [Interactive embedding quick start](./interactive-embedding-quick-start-guide.md)
- [Strategies for delivering customer-facing analytics](https://www.metabase.com/learn/metabase-basics/embedding/overview).
- [Permissions strategies](https://www.metabase.com/learn/metabase-basics/administration/permissions/strategy).
- [Customizing Metabase's appearance](../configuring-metabase/appearance.md).
