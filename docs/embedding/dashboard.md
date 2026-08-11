---
title: Embed a dashboard
summary: "Embed a Metabase dashboard in your app — view-only, interactive, or editable — with a web component or using the React SDK."
redirect_from:
  - /docs/latest/embedding/sdk/dashboards
---

# Embed a dashboard

There are three ways you can embed a dashboard:

- [View-only dashboard](#embed-a-view-only-dashboard): people see the results, filter them, and that's it.
- [Interactive dashboard](#embed-an-interactive-dashboard): people can drill through the charts on the dashboard and explore the data behind them.
- [Editable dashboard](#let-people-edit-dashboards): people can add cards, rearrange the layout, and change the dashboard itself.

To embed a single chart instead, check out [Embed a chart](./chart.md). To let people build questions from scratch, check out [Embed the query builder](./query-builder.md).

> The React SDK doesn't support more than one dashboard component on the same page yet.

## Embed a view-only dashboard

A view-only (a.k.a. "static") dashboard displays results without letting people explore the data. Nobody can drill through the charts or change the questions behind them. You can, however, add editable filters that people can change to update the results.

View-only isn't tied to one kind of embed. You can make a dashboard view-only in any embedding type:

- **[Guest embeds](./introduction.md#guest-embedding)**: always view-only. Nobody logs in to a guest embed, so Metabase has no account to check permissions against, and no way to tell whether a new query is one that person should be allowed to run. The published dashboard is the only thing Metabase can safely run, which is why there's no drill-through or ad-hoc querying to turn off.
- **[SSO embeds](./introduction.md#sso-embeds)**: interactive out of the box. With a web component, make one view-only by turning off drill-through with `drills="false"`. The SDK has no `drills` prop, so use the view-only `StaticDashboard` component instead of `InteractiveDashboard`. You can also manage what people can do through [data permissions](../permissions/data.md) and [collection permissions](../permissions/collections.md).

So pick your authentication based on what your app needs---plans, permissions, whether Metabase should know who's viewing---not on whether you want a view-only dashboard. Check out [SSO or guest embeds](./introduction.md#comparison-between-sso-and-guest-embeds).

This section covers setting up a view-only dashboard with guest authentication.

- [Web components](#view-only-dashboards-with-guest-authentication-using-a-web-component)
- [React SDK](#view-only-dashboards-using-the-react-sdk)

### View-only dashboards with guest authentication using a web component

You can use the in-app wizard to set up a view-only dashboard using web components.

![In-app embedding wizard](./images/in-app-embedding-wizard.png)

Before you start, an admin needs to [turn on guest embedding](./guest-embedding.md#turning-on-guest-embedding-in-metabase).

Three things need to happen: you publish the embed in Metabase, you paste the dashboard code into your app, and your server signs a JWT. The wizard writes most of the code for you, so the list below is longer than the work.

1. Visit the dashboard in your Metabase.
2. Click the **Share** icon in the upper right.
3. Select **Embed** to open the embedding wizard.
4. For authentication, choose **Guest**, so your app won't need to log anyone in to your Metabase.
5. Click the **Publish** button. Publishing only applies to guest embeds. (There's nothing to publish for an SSO embed, because in that case people can explore the data based on their data and collection permissions.)
6. Under behavior, Metabase gives you several options for customizing how the embed works. See [web component attributes](./dashboard-reference.md#metabase-dashboard-web-component-attributes) for what each one does. If you'd picked SSO in step 4, this is where you'd make the embed view-only by turning off drill-through.
7. Set each of the dashboard's filters to **Editable** or **Locked**. Filters are **Disabled** by default, which hides them and prevents your server from setting them. See [Configuring parameters](./guest-embedding.md#configuring-parameters).
8. Customize the [appearance](./appearance.md).
9. Click the **Get code** button. You'll get both the frontend and backend code based on the selections you made in the wizard.
10. Copy the client code and paste it in your app.
11. Remove the hardcoded JWT tokens in your HTML. Fetch the token from your backend and pass the token to the component programmatically.

To keep an embed alive after its token expires, configure a token endpoint with [`guestEmbedProviderUri`](./guest-embedding.md#refreshing-or-initializing-the-jwt-from-your-server).

#### View-only dashboard example with web components

Say you have a sales dashboard with a **Customer** filter, and you want to put it on each customer's account page in your app, showing only that customer's numbers. Here's the frontend code.

```html
<script defer src="https://your-metabase.example.com/app/embed.js"></script>
<script>
  function defineMetabaseConfig(config) {
    window.metabaseConfig = config;
  }
</script>

<script>
  defineMetabaseConfig({
    instanceUrl: "https://your-metabase.example.com",
    isGuest: true,
    theme: {
      colors: {
        brand: "#509EE3",
        "text-primary": "hsla(204, 66%, 8%, 0.84)",
      },
    },
  });
</script>

<!--
Fetch the JWT token from your backend and programmatically pass it to the 'metabase-dashboard'.
-->
<metabase-dashboard
  token="PASS_SIGNED_TOKEN_FROM_SERVER"
  with-title="true"
  with-downloads="true"
>
</metabase-dashboard>
```

The `theme` key sets the dashboard's appearance. For the full theme object with all the options, check out [Appearance](./appearance.md).

On your app's server, set the value for the locked filter in the token. Whoever's looking at the page can't see or change that value, so an embed on customer 13's account page returns only customer 13's numbers.

```js
// you will need to install via 'npm install jsonwebtoken' or in your package.json

const jwt = require("jsonwebtoken");

// Get your key from your Metabase at
// /admin/embedding/guest -> Embedding secret key
const METABASE_SECRET_KEY = "YOUR_SECRET_KEY";

// Here we lock a customer_id parameter to 13
const payload = {
  resource: { dashboard: 10 },
  params: {
    customer_id: [
      13, // set this programmatically, based on whose account page your app is rendering
    ],
  },
  exp: Math.round(Date.now() / 1000) + 10 * 60, // 10 minute expiration
};
const token = jwt.sign(payload, METABASE_SECRET_KEY);
```

Note that the `resource` key takes `dashboard` here, where a chart embed takes `question`.

To get this code from the in-app wizard, set the `customer_id` filter to **Locked** and publish the dashboard. See [Locked parameters](./guest-embedding.md#locked-parameters).

For all modular embeds, you can also set a `locale` in your page-level configuration to [translate embedded content](./translations.md).

For the full list of attributes, see [web component attributes](./dashboard-reference.md#metabase-dashboard-web-component-attributes).

### View-only dashboards using the React SDK

{% include plans-blockquote.html feature="Modular embedding SDK" sdk=true convert_pro_link_to_embedding=true %}

To embed a view-only dashboard with the [SDK](./sdk/introduction.md), use the `StaticDashboard` component. Wrap the component in the `MetabaseProvider` component with your auth config.

```typescript
{% include_file "{{ dirname }}/sdk/snippets/dashboards/static-dashboard.tsx" %}
```

For the full list of props, see [`StaticDashboard` props](./dashboard-reference.md#staticdashboard-props).

## Embed an interactive dashboard

{% include plans-blockquote.html feature="Interactive dashboards" convert_pro_link_to_embedding=true is_plural=true %}

An interactive dashboard lets people explore their data: they can drill through the charts on the dashboard, filter results, and open the questions behind the cards to summarize and group them.

Interactive dashboards require SSO, which you can set up with either web components or the React SDK.

- [Web components](#interactive-dashboards-using-a-web-component)
- [React SDK](#interactive-dashboards-using-the-react-sdk)

### Interactive dashboards using a web component

Reference an existing dashboard by ID. [Drill-through](../questions/visualizations/drill-through.md) is on by default:

```html
<metabase-dashboard dashboard-id="Xk3YzAbCdEfGhIjKlMnOp"></metabase-dashboard>
```

You can pass a sequential ID like `1`, but an [entity ID](../installation-and-operation/serialization.md#entity-ids-work-with-embedding) is the better bet: entity IDs stay the same when you move content between instances, like from staging to production.

To control what people can do with the dashboard, check out [web component attributes](./dashboard-reference.md#metabase-dashboard-web-component-attributes). For example, you can show or hide download buttons, the dashboard's title, or its filter widgets.

#### Let people follow links to other dashboards and questions

By default, an embedded dashboard is a dead end: clicking a link to another dashboard or question does nothing, so people stay on the one thing you embedded. To let them navigate to linked content inside the embed, turn on `enable-entity-navigation`:

```html
<metabase-dashboard
  dashboard-id="Xk3YzAbCdEfGhIjKlMnOp"
  drills="true"
  enable-entity-navigation="true"
></metabase-dashboard>
```

Entity navigation needs `drills` set to `true`. In the SDK, the equivalent prop is `enableEntityNavigation`, which is also off by default. People can still only open content they have [collection permissions](../permissions/collections.md) for.

### Interactive dashboards using the React SDK

Use `InteractiveDashboard` when you want people to explore their data.

![Embedded dashboard](./images/embedded-example-dashboard.png)

```typescript
{% include_file "{{ dirname }}/sdk/snippets/dashboards/interactive-dashboard.tsx" %}
```

For the full list of props, see [`InteractiveDashboard` props](./dashboard-reference.md#interactivedashboard-props).

#### Customize the drill-through question layout

Drilling through or clicking on a question card in the dashboard takes people to the question view with the [default layout](./question-reference.md#customize-the-layout-of-an-interactive-chart) for interactive questions.

To customize that layout, pass a `renderDrillThroughQuestion` prop to `InteractiveDashboard`, with your custom view as the child component.

```typescript
{% include_file "{{ dirname }}/sdk/snippets/dashboards/custom-drill-through-question-layout.tsx" snippet="example-1" %}

{% include_file "{{ dirname }}/sdk/snippets/dashboards/custom-drill-through-question-layout.tsx" snippet="example-2" %}
```

`renderDrillThroughQuestion` accepts a React component, which you can build out of the namespaced components inside `InteractiveQuestion`. See [customize the layout](./question-reference.md#customize-the-layout-of-an-interactive-chart).

## Let people edit dashboards

{% include plans-blockquote.html feature="Modular embedding SDK" sdk=true convert_pro_link_to_embedding=true %}

`EditableDashboard` does everything `InteractiveDashboard` does, and also lets people add and update questions, content, and the dashboard's layout.

```tsx
<MetabaseProvider authConfig={authConfig}>
  <EditableDashboard dashboardId={1} />
</MetabaseProvider>
```

Editing is only available in the React SDK---there's no `<metabase-dashboard>` attribute that turns it on. With web components, the closest thing is the [browser component](./components.md#browser) with `read-only="false"`, which lets people edit the dashboards they open from a collection.

Whoever's editing needs [curate access](../permissions/collections.md#curate-access) to the collection the dashboard lives in. Dashboards in the [usage analytics](../usage-and-performance-tools/usage-analytics.md) collection are always read-only, whatever the permissions say.

For the full list of props, see [`EditableDashboard` props](./dashboard-reference.md#editabledashboard-props).

## Let people create dashboards

{% include plans-blockquote.html feature="Modular embedding SDK" sdk=true convert_pro_link_to_embedding=true %}

You can let people create new dashboards from your app with either the `useCreateDashboardApi` hook or the `CreateDashboardModal` component. Both create an empty dashboard, which you'd typically hand to `EditableDashboard` so people can fill it in.

### `useCreateDashboardApi`

Use the hook when you want total control over the UI. Until the SDK is fully loaded and initialized, the hook returns `null`, so check for that before calling `createDashboard`.

```typescript
{% include_file "{{ dirname }}/sdk/snippets/dashboards/create-dashboard.tsx" snippet="example-hook" %}
```

For the options you can pass, see [`useCreateDashboardApi` options](./dashboard-reference.md#usecreatedashboardapi-options).

### `CreateDashboardModal`

Use the component when Metabase's own modal is good enough. It hands the new dashboard to `onCreate`:

```typescript
{% include_file "{{ dirname }}/sdk/snippets/dashboards/create-dashboard.tsx" snippet="example-component" %}
```

For the full list of props, see [`CreateDashboardModal` props](./dashboard-reference.md#createdashboardmodal-props).

## Customize the menu on dashboard cards

{% include plans-blockquote.html feature="Modular embedding SDK" sdk=true convert_pro_link_to_embedding=true %}

Every card on an interactive dashboard gets an overflow menu in its top right corner, with actions like downloading results and editing the question. The `dashboardCardMenu` plugin lets you change what's in that menu, add your own actions, or replace the menu entirely.

For the configuration and examples, see [`dashboardCardMenu` plugin](./dashboard-reference.md#dashboardcardmenu-plugin).

## Customize what happens when someone clicks on a chart

To change the menu people get when they click a data point on a dashboard card, use the `mapQuestionClickActions` plugin. See [Customize what happens when someone clicks on a chart](./chart.md#customize-what-happens-when-someone-clicks-on-a-chart).

## Send people elsewhere with custom destinations

You can wire a click on a dashboard card to open another dashboard, a question, or an external URL. See [custom destinations](../dashboards/interactive.md#custom-destinations).

In guest embeds, you can only use the **URL** option, and external URLs open in a new tab or window. You can propagate filter values into the URL, unless the filter is locked.

## Control dashboard filters from your app

Say you want to show each customer only their own numbers. How you filter the results depends on how you authenticate the embed.

### Lock a filter on a guest embed

Embeds with **Guest** authentication can [lock a parameter](./guest-embedding.md#locked-parameters). Your app sets the filter's value in the signed token on your server, so the filter is controlled by your app rather than by whoever's clicking around the page. They can't see the value, and they can't change it.

```javascript
const payload = {
  resource: { dashboard: 10 },
  params: {
    category: ["Gadget"], // Locked. Set by your app, not by whoever's viewing.
  },
  exp: Math.round(Date.now() / 1000) + 10 * 60,
};

const token = jwt.sign(payload, METABASE_SECRET_KEY);
```

Two things to know about locked filters on dashboards:

- Locking a filter narrows the values available to the other filters on the dashboard. If you lock **State** to "Vermont", a **City** filter will only offer cities in Vermont, as though the filters were [linked](../dashboards/filters.md#linking-filters).
- If a locked filter is linked to _any_ SQL question on the dashboard, you can only pass a _single_ value for it in the JWT.

### Use permissions on an SSO embed

Embeds with **SSO** don't need to lock filters. Since Metabase knows who's viewing, you can apply [data permissions](../permissions/embedding.md) and let Metabase filter the rows, instead of locking filters by hand.

### Set filter values from your app

You can set a dashboard's filter values from your app, and keep your app in sync as people change them. Set the values once on load, or hold the values in your app and get a callback whenever they change.

For both the SDK props (`initialParameters`, `parameters`, and `onParametersChange`) and the web component equivalents, see [Modular embedding parameters](./parameters.md#pass-parameter-values-to-a-dashboard).

### Hide a filter

To hide a filter from the dashboard's UI, use the [`hidden-parameters`](./dashboard-reference.md#metabase-dashboard-web-component-attributes) attribute (web component) or the `hiddenParameters` prop (SDK). Both require a Pro or Enterprise plan and an SSO embed; `hidden-parameters` isn't supported on guest embeds. To hide a filter on a guest embed, set it to **Locked** or leave it **Disabled** in the dashboard's embed settings.

## Let people set up dashboard subscriptions

You can let people set up [dashboard subscriptions](../dashboards/subscriptions.md) with the [`with-subscriptions`](./dashboard-reference.md#metabase-dashboard-web-component-attributes) attribute on the web component:

```html
<metabase-dashboard
  dashboard-id="42"
  with-subscriptions="true"
></metabase-dashboard>
```

Or by passing `withSubscriptions` to a dashboard component in the SDK:

```tsx
<MetabaseProvider authConfig={authConfig}>
  <InteractiveDashboard dashboardId={42} withSubscriptions />
</MetabaseProvider>
```

Metabase only shows the subscriptions button when all of these are true:

- Your Metabase has [email set up](../configuring-metabase/email.md). Slack on its own isn't enough.
- The embed is an authenticated (SSO) embed. Guest embeds don't get subscriptions.
- The dashboard has at least one card that isn't a text or heading card.

Whoever's viewing also needs [collection permissions](../permissions/collections.md) for the collection that holds the dashboard, and the [Subscriptions and alerts](../permissions/application.md#subscriptions-and-alerts) application permission to create one.

Subscriptions sent from an embedded dashboard exclude links to Metabase items.

## Refresh a dashboard automatically

To re-run a dashboard's cards on a timer, set `auto-refresh-interval` to a number of seconds:

```html
<metabase-dashboard
  dashboard-id="42"
  auto-refresh-interval="60"
></metabase-dashboard>
```

In the SDK, pass the same value in seconds to `autoRefreshInterval`:

```tsx
<MetabaseProvider authConfig={authConfig}>
  <InteractiveDashboard dashboardId={42} autoRefreshInterval={60} />
</MetabaseProvider>
```

Each refresh re-queries your database, so pick an interval your database can keep up with.

## Customize dashboard appearance

You can theme an embedded dashboard and toggle parts of its UI. For the full set of theming options, see [Appearance](./appearance.md). For every attribute and prop, see the [Dashboard component reference](./dashboard-reference.md).

- **Title**: show or hide the dashboard title with `with-title` (web component) or `withTitle` (SDK).
- **Downloads**: show or hide the button that downloads the dashboard as a PDF, plus the download buttons on each card's results, with `with-downloads` / `withDownloads`. Defaults to `true` on OSS/Starter and `false` on Pro/Enterprise. Disabling downloads requires a [Pro](https://www.metabase.com/product/pro) or [Enterprise](https://www.metabase.com/product/enterprise) plan.
- **Height**: dashboard components fill the height of their container (`min-height: 100%`). Override that with the `style` or `className` props:

```tsx
{% include_file "{{ dirname }}/sdk/snippets/dashboards/custom-height.tsx" snippet="example" %}
```

- **Theme**: set a light or dark preset, or (on Pro/Enterprise) customize colors and fonts. The `dashboard` component in the theme has its own overrides:

```js
{
  components: {
    dashboard: {
      // Background color for all dashboards
      backgroundColor: "#2F3640",

      // Border color of the dashboard grid, shown only when editing dashboards
      gridBorderColor: "#EEECEC",

      card: {
        // Background color for all dashboard cards
        backgroundColor: "#2D2D30",

        // Apply a border color instead of shadow for dashboard cards
        border: "1px solid #EEECEC",
      },
    },
  },
}
```

Colors set in a card's visualization settings override theme colors.

On the OSS and Starter plans, Metabase adds a "Powered by Metabase" banner to guest embeds. See [Removing the "Powered by Metabase" banner](./guest-embedding.md#removing-the-powered-by-metabase-banner).

## Further reading

- [Dashboard component reference](./dashboard-reference.md)
- [Embed a chart](./chart.md)
- [Embed the query builder](./query-builder.md)
- [Appearance](./appearance.md)
- [Modular embedding parameters](./parameters.md)
- [Translating embeds](./translations.md)
- [Guest embeds](./guest-embedding.md)
- [Authentication](./authentication.md)
- [Modular embedding SDK](./sdk/introduction.md)
- [AI chat](./sdk/ai-chat.md)
