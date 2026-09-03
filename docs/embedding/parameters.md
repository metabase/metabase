---
title: Embedding parameters
summary: "Set, control, hide, and lock dashboard filters and SQL variables in embedded dashboards and charts, with web components, the React SDK, or an iframe."
redirect_from:
  - /docs/latest/embedding/static-embedding-parameters
  - /docs/latest/embedding/signed-embedding-parameters
---

# Embedding parameters

A parameter is a value that changes what data an embedded dashboard or chart shows: a [dashboard filter](../dashboards/filters.md), a [SQL variable or field filter](../questions/native-editor/sql-parameters.md), or a time grouping. Questions built with the query builder don't expose parameters in embeds; to filter one, add it to a dashboard and connect a filter to the card.

## Choose parameter visibility in the embed wizard

When you embed a dashboard or SQL question, the embedding wizard will offer different parameter options depending on which authentication method you pick. With **SSO** authentication, you can set a default value and choose whether to hide a parameters widget. With **guest** authentication, however, every parameter starts out **Disabled**, and for each parameter you can pick from:

- **Disabled**: no widget, and nobody can set a value.
- **Editable**: the widget shows, people can change the value, and your page can set a [starting value](#set-starting-values).
- **Locked**: no widget. Your server sets the value in the signed token. Check out [Restrict data with locked parameters](#restrict-data-with-locked-parameters).

You can't disable a filter that [always requires a value](../dashboards/filters.md#make-a-filter-or-parameter-required).

## Restrict data with locked parameters

![Locked parameters](./images/locked-parameters.png)

Say you want each customer to see only their own rows. On an embed with guest authentication, nobody's signed in to your Metabase, so permissions can't scope rows per person. Instead, you can lock the parameter: your server sets the parameter's value in the signed token, and Metabase applies the value before running anything. And because the value is set by the token, the viewer won't be able to change it.

On an SSO embed, you don't need locked parameters. With SSO, your Metabase knows who's viewing, so [data permissions](../permissions/embedding.md) and [row and column security](../permissions/row-and-column-security.md) filter the rows for you.

### Lock a parameter

1. Visit the dashboard or question, click the **Share** icon, and select **Embed**.
2. Under **Parameters**, set the parameter to **Locked**.
3. Optional: pick a value under **Preview locked parameters**. The wizard writes it into the server code it generates, so you can see the exact format Metabase expects.
4. Click **Publish**.
5. On your server, put the value in the `params` object when you sign the token:

```javascript
// Install via 'npm install jsonwebtoken'
const jwt = require("jsonwebtoken");

const METABASE_SECRET_KEY = "YOUR_METABASE_SECRET_KEY";

const payload = {
  resource: { dashboard: 10 },
  params: {
    // Keyed by slug. Values are arrays. Set this from your app's session, not from the page.
    customer_id: [13],
  },
  exp: Math.round(Date.now() / 1000) + 10 * 60, // 10 minute expiration
};

const token = jwt.sign(payload, METABASE_SECRET_KEY);
```

Then pass the token to the component, as the `token` attribute on `<metabase-dashboard>` or the `token` prop on `StaticDashboard` in the SDK, or have the embed fetch it from your server. On a [static embed](./static-embedding.md#adding-the-embedding-url-to-your-website), the token goes in the iframe URL instead. The dashboard shows only customer 13's rows, with no **Customer ID** widget. For fetching and refreshing the token, check out [Guest embeds](./guest-embedding.md#refreshing-or-initializing-the-jwt-from-your-server).

Some notes on locked parameters:

- **Every token has to include every locked parameter.** Leave out a parameter, and Metabase refuses the request.
- **A locked value narrows the options in editable widgets.** Lock **State** to Vermont, and an editable **City** filter on the same dashboard only lists Vermont cities (like [linked filters](../dashboards/filters.md#linking-filters)).
- **Multiple locked parameters combine with AND.** To skip a locked parameter for a given token, pass `[]` as its value.
- **The key in `params` is the filter's slug.** If you rename a locked dashboard filter, update the key in your server code to match. Locked parameters connected to a [SQL variable](../questions/native-editor/sql-parameters.md) keep the variable's name, so renaming the widget doesn't affect them.

[Params in a signed token](./parameters-reference.md#params-in-a-signed-token) covers the value format, the error messages, and how Metabase treats empty arrays and blank strings.

## Set starting values

To open an embed with some set-and-forget filters already applied, pass starting values keyed by slug. From there, people can change the value via the filter widgets.

If instead you want your app to be able to push values, or see when people change a widget's values, use [controlled values](#control-values-from-your-app).

- [Web component](#web-component-starting-values)
- [React SDK](#react-sdk-starting-values)

### Web component starting values

```html
<metabase-dashboard
  dashboard-id="1"
  initial-parameters='{"state": "NY", "category": ["Gadget", "Gizmo"]}'
></metabase-dashboard>

<metabase-question
  question-id="42"
  initial-sql-parameters='{"product_id": 50}'
></metabase-question>
```

Changing the attribute after load reloads the embed and discards whatever people had picked.

### React SDK starting values

{% include plans-blockquote.html feature="Modular embedding SDK" sdk=true convert_pro_link_to_embedding=true %}

Dashboards take `initialParameters`:

```typescript
{% include_file "{{ dirname }}/snippets/parameters/dashboards/initial-parameters.tsx" snippet="example" %}
```

SQL questions take `initialSqlParameters`:

```typescript
{% include_file "{{ dirname }}/snippets/parameters/questions/initial-sql-parameters.tsx" snippet="example" %}
```

## Control values from your app

When your app needs to be the source of truth for filter values, use the controlled props. They work like a controlled `<input>` in React: you hold the values, the embed applies whatever you hand it, and it calls you back whenever they change. Use them to [build your own filter widgets](#build-your-own-filter-ui) or to sync filters with your app's URL.

Don't combine controlled values with starting values: if you pass both, the embed uses the controlled values and logs a warning to the console.

- [Web component](#web-component-controlled-values)
- [React SDK](#react-sdk-controlled-values)

### Web component controlled values

Set the value as an attribute. To catch edits people make in Metabase's widgets, listen for `parameters-change` on the element (it doesn't bubble):

```html
<metabase-dashboard
  id="my-dashboard"
  dashboard-id="1"
  parameters='{"state": "NY"}'
></metabase-dashboard>

<script>
  const el = document.getElementById("my-dashboard");

  // Fires on load, when someone changes a widget, and when Metabase
  // normalizes a value you pushed. `source` says which.
  el.addEventListener("parameters-change", (event) => {
    const { source, parameters } = event.detail;
    console.log(source, parameters);
  });

  // Push a new value. The embed re-queries without reloading.
  el.parameters = { state: "CA" };
</script>
```

For a SQL question, use the `sql-parameters` attribute or `sqlParameters` property on `<metabase-question>`, and listen for `sql-parameters-change`.

### React SDK controlled values

{% include plans-blockquote.html feature="Modular embedding SDK" sdk=true convert_pro_link_to_embedding=true %}

Pair `parameters` with `onParametersChange`, and keep the values in state:

```typescript
{% include_file "{{ dirname }}/snippets/parameters/dashboards/controlled-parameters.tsx" snippet="example-controlled" %}
```

For SQL questions, pair `sqlParameters` with `onSqlParametersChange`:

```typescript
{% include_file "{{ dirname }}/snippets/parameters/questions/controlled-sql-parameters.tsx" snippet="example-controlled" %}
```

You must update your state from the callback. If you don't, the embed snaps back to the values in your prop on the next render, and people's edits disappear.

The [callback's payload](./parameters-reference.md#change-payload) includes the applied values, each parameter's default (handy for a reset button), and a `source` that says why it fired. To clear one filter, pass `null` for its slug; to reset it to its default, leave the slug out. For the full rules, check out [How values resolve](./parameters-reference.md#how-values-resolve).

## Hide parameter widgets

On an [SSO embed](./introduction.md#components-with-sso-authentication), every parameter shows a widget by default. To hide a parameter's widget without disabling the parameter, list its slug in `hidden-parameters` (web component) or `hiddenParameters` (SDK). Both work on dashboards and SQL questions.

- [Web component](#web-component-hidden-widgets)
- [React SDK](#react-sdk-hidden-widgets)

### Web component hidden widgets

```html
<metabase-dashboard
  dashboard-id="1"
  initial-parameters='{"state": "NY"}'
  hidden-parameters='["state"]'
></metabase-dashboard>
```

### React SDK hidden widgets

{% include plans-blockquote.html feature="Modular embedding SDK" sdk=true convert_pro_link_to_embedding=true %}

```typescript
{% include_file "{{ dirname }}/snippets/parameters/dashboards/hidden-parameters.tsx" snippet="example" %}
```

The same prop works on `StaticQuestion` and `InteractiveQuestion`.

Guest embeds with web components ignore `hidden-parameters`. On a guest embed, only **Editable** parameters get a widget in the first place, so to remove one, set the parameter to **Disabled** or **Locked** in the embed wizard instead.

Hiding a widget doesn't restrict anything: the value is still set from the browser, which means that anyone can open the console to change the value. To restrict what people can query, [lock the parameter](#restrict-data-with-locked-parameters) on a guest embed, or use [permissions](../permissions/embedding.md) on an SSO embed.

## Build your own filter UI

If Metabase's widgets don't fit your app, hide them and make your own. How you push values to the charts depends on how the embed authenticates: on an SSO embed, your app sets the values directly, and on a guest embed, your server re-signs the token.

- [SSO embeds](#sso-embeds-control-the-values-and-hide-the-widgets)
- [Guest embeds](#guest-embeds-lock-the-parameter-and-re-sign-the-token)

### SSO embeds: control the values and hide the widgets

Hold the values in your app with the [controlled props](#control-values-from-your-app), hide Metabase's widgets, and the embed re-queries whenever your widget changes the value.

#### Web component custom filter UI

Push your widget's value with the `parameters` property, and hide Metabase's widget with `hidden-parameters`:

```html
<select id="state-picker">
  <option value="NY">New York</option>
  <option value="CA">California</option>
</select>

<metabase-dashboard
  id="my-dashboard"
  dashboard-id="1"
  parameters='{"state": "NY"}'
  hidden-parameters='["state"]'
></metabase-dashboard>

<script>
  const el = document.getElementById("my-dashboard");

  document
    .getElementById("state-picker")
    .addEventListener("change", (event) => {
      // Your widget owns the value. The embed re-queries without reloading.
      el.parameters = { state: event.target.value };
    });
</script>
```

#### React SDK custom filter UI

Pass your widget's value in `parameters`, and hide Metabase's widget with `hiddenParameters`:

```typescript
{% include_file "{{ dirname }}/snippets/parameters/dashboards/custom-filter-ui.tsx" snippet="example" %}
```

If you'd rather keep Metabase's SQL widgets and only move them, the SDK's `InteractiveQuestion.SqlParametersList` renders them wherever you put it in a [custom layout](./question-reference.md#customize-the-layout-of-an-interactive-chart).

### Guest embeds: lock the parameter and re-sign the token

On a guest embed, lock the parameter and let your widget own it. When someone changes the value, ask your server for a new token signed with the updated `params`, and hand it to the component. The embed re-queries with the new locked value.

#### Web component re-signed token

```html
<metabase-dashboard
  id="my-dashboard"
  token="INITIAL_SIGNED_TOKEN"
></metabase-dashboard>

<script>
  async function onRegionChange(region) {
    // Your endpoint signs a token with params: { region: [region] }
    const response = await fetch(`/api/metabase-token?region=${region}`);
    const { jwt } = await response.json();
    document.getElementById("my-dashboard").setAttribute("token", jwt);
  }
</script>
```

Render the first token into the `token` attribute yourself rather than letting [`guestEmbedProviderUri`](./guest-embedding.md#refreshing-or-initializing-the-jwt-from-your-server) fetch it. An embed that starts without a token fetches one on load, and that token would overwrite the value your widget just set.

#### React SDK re-signed token

Hold the token in state and pass it to the `token` prop on `StaticDashboard`. Guest embeds in the SDK need `isGuest: true` in the `MetabaseProvider` auth config, and a page can use only one authentication method. Check out [Using guest embeds with the SDK](./guest-embedding.md#using-guest-embeds-with-the-sdk).

```typescript
{% include_file "{{ dirname }}/snippets/parameters/dashboards/guest-locked-token.tsx" snippet="example" %}
```

## Parameters in iframe embeds

Everything above applies to [modular embeds](./modular-embedding.md). The iframe-based embeds set parameters through the URL instead:

- **[Public links and public embeds](./public-links.md#public-embed-parameters)**: add `?slug=value` to set a filter, and `#hide_parameters=slug` to hide its widget. Anyone can edit the URL, so these don't restrict data.
- **[Static embeds](./static-embedding.md)**: same token and rules as guest embeds. Set a parameter to **Locked** and pass its value in `params`. Editable parameters get a widget in the iframe, and take starting values from the URL with the same syntax as public embeds.
- **[Full app embedding](./full-app-embedding.md)**: filter values go in the Metabase URL you load in the iframe, the same way as in Metabase itself.

## Further reading

- [Parameters reference](./parameters-reference.md)
- [Guest embeds](./guest-embedding.md)
- [Data isolation methods](../permissions/data-isolation-methods.md)
