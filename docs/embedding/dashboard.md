---
title: Embed a dashboard
summary: "Embed a Metabase dashboard in your app — view-only, interactive, or editable — with a web component or using the React SDK."
redirect_from:
  - /docs/latest/embedding/sdk/dashboards
---

# Embed a dashboard

![Embedded dashboard from Shoppy, our SDK demo](./images/embedded-dashboard.png)

_Embedded dashboard from our SDK demo site, [Shoppy](https://embedded-analytics-sdk-demo.metabase.com)_

There are three ways you can embed a dashboard:

- [View-only dashboard](#embed-a-view-only-dashboard): people see the results, filter them, and that's it.
- [Interactive dashboard](#embed-an-interactive-dashboard): people can drill through the charts on the dashboard and explore the data behind them.
- [Editable dashboard](#embed-an-editable-dashboard): people also can add cards, rearrange the layout, and save the changes.

## Embed a view-only dashboard

A view-only (a.k.a. "static") dashboard displays results without letting people explore the data. Nobody can drill through the charts or change the questions behind them. You can, however, add editable filters that people can change to update the results, as well as locked filters you can use to filter results based on who is logged in to your app.

- [Web component](#web-component-view-only-dashboard)
- [React SDK](#react-sdk-view-only-dashboard)

View-only isn't tied to one kind of embed:

- **[Guest embeds](./introduction.md#guest-embedding)**: always view-only. Nobody logs in to a guest embed, so Metabase has no account to check permissions against.
- **[SSO embeds](./introduction.md#sso-embeds)**: interactive by default. To make one view-only, turn off drill-through with `drills="false"` (web component), or use `StaticDashboard` instead of `InteractiveDashboard` (SDK).

For view-only items, you'll almost always want to go with guest authentication (so you don't have to pay for each person viewing the item). If, however, you also want people to be able to self-serve data (in addition to displaying view-only items), go with SSO. Check out [SSO or guest embeds](./introduction.md#comparison-between-sso-and-guest-embeds).

### Web component view-only dashboard

You can use the in-app wizard to set up a view-only dashboard using web components. These steps walk through a guest embed.

![In-app embedding wizard](./images/in-app-embedding-wizard.png)

Three things need to happen: you publish the dashboard embed in Metabase, you paste the dashboard code into your app (both frontend and backend), and your server signs a JWT. The wizard writes most of the code for you, so the list below is longer than the work.

1. Visit the dashboard in your Metabase.
2. Click the **Share** icon in the upper right.
3. Select **Embed** to open the embedding wizard.
4. For authentication, choose **Guest**, so your app won't need to log anyone in to your Metabase. An admin needs to [turn on guest embedding](./guest-embedding.md#turning-on-guest-embedding-in-metabase) first.
5. Click the **Publish** button. Publishing only applies to guest embeds. (There's nothing to publish for an interactive/SSO embed, because in that case people can explore the data based on their data and collection permissions.)
6. Under behavior, Metabase gives you several options for customizing how the embed works. See [web component attributes](./dashboard-reference.md#web-component-metabase-dashboard-attributes) for what each attribute does. With guest embeds, you can only control whether people can download the data. If you'd picked SSO in step 4, this is where you'd make the embed view-only by turning off drill-through.
7. If your dashboard has filters, set each filter to **Editable** or **Locked**, or leave as **Disabled**. Filters are disabled by default, which hides them and prevents your server from setting them. See [Configuring parameters](./guest-embedding.md#configuring-parameters).
8. Customize the [appearance](./appearance.md).
9. Click the **Get code** button. You'll get both the frontend and backend code based on the selections you made in the wizard.
10. Copy the client code and paste it in your app.
11. Remove the hardcoded JWT tokens in your HTML. Fetch the token from your backend and pass the token to the component programmatically.

To keep an embed alive after its token expires, configure a token endpoint with [`guestEmbedProviderUri`](./guest-embedding.md#refreshing-or-initializing-the-jwt-from-your-server).

#### Web component view-only dashboard example

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

On your app's server, sign a token that sets the **Customer** filter to whoever's account page your app is rendering. Whoever's looking at the page can't see or change that value, so an embed on customer 13's account page returns only customer 13's numbers. To be clear, with guest embeds, only your app would know who's viewing the page, as you're not using SSO to also sign the person in to your Metabase.

For the signing code, see [Locked parameters](./guest-embedding.md#locked-parameters). To get this code from the in-app wizard, set the **Customer** filter to **Locked**.

For all modular embeds, you can also set a `locale` in your page-level configuration to [translate embedded content](./translations.md).

For the full list of attributes, see [web component attributes](./dashboard-reference.md#web-component-metabase-dashboard-attributes).

### React SDK view-only dashboard

{% include plans-blockquote.html feature="Modular embedding SDK" sdk=true convert_pro_link_to_embedding=true %}

To embed a view-only dashboard with the [SDK](./sdk/introduction.md), use the `StaticDashboard` component. Wrap the component in the `MetabaseProvider` component with your auth config.

> The React SDK doesn't support more than one dashboard component on the same page yet. That applies to `StaticDashboard`, `InteractiveDashboard`, and `EditableDashboard` alike, so a page can hold one of them, not two.

```typescript
{% include_file "{{ dirname }}/sdk/snippets/dashboards/static-dashboard.tsx" %}
```

For the full list of props, see [`StaticDashboard` props](./dashboard-reference.md#react-sdk-staticdashboard-props).

## Embed an interactive dashboard

{% include plans-blockquote.html feature="Interactive dashboards" convert_pro_link_to_embedding=true is_plural=true %}

An interactive dashboard lets people explore their data: they can drill through the charts on the dashboard, filter results, and open the questions behind the cards to summarize and group them.

Interactive dashboards require SSO, which you can set up with either web components or the React SDK.

- [Web component](#web-component-interactive-dashboard)
- [React SDK](#react-sdk-interactive-dashboard)

### Web component interactive dashboard

Reference an existing dashboard by ID. [Drill-through](../questions/visualizations/drill-through.md) is on by default:

```html
<metabase-dashboard dashboard-id="Xk3YzAbCdEfGhIjKlMnOp"></metabase-dashboard>
```

You can pass a sequential ID like `1`, but prefer an [entity ID](../installation-and-operation/serialization.md#entity-ids-work-with-embedding).

To control what people can do with the dashboard, check out [web component attributes](./dashboard-reference.md#web-component-metabase-dashboard-attributes).

#### Let people follow links to other dashboards and questions

By default, clicking a link to another dashboard or question does nothing, so people stay on the one thing you embedded. To let them navigate to linked content inside an SSO embed, turn on `enable-entity-navigation`:

```html
<metabase-dashboard
  dashboard-id="Xk3YzAbCdEfGhIjKlMnOp"
  drills="true"
  enable-entity-navigation="true"
></metabase-dashboard>
```

Entity navigation needs `drills` set to `true`. In the SDK, the equivalent prop is `enableEntityNavigation`, which is also off by default. People can still only open content they have [collection permissions](../permissions/collections.md) for.

### React SDK interactive dashboard

Use `InteractiveDashboard` when you want people to explore their data.

![Embedded dashboard](./images/embedded-example-dashboard.png)

```typescript
{% include_file "{{ dirname }}/sdk/snippets/dashboards/interactive-dashboard.tsx" %}
```

For the full list of props, see [`InteractiveDashboard` props](./dashboard-reference.md#react-sdk-interactivedashboard-props).

#### Customize the drill-through question layout

Drilling through or clicking on a question card in the dashboard takes people to the question view with the [default layout](./question-reference.md#customize-the-layout-of-an-interactive-chart) for interactive questions.

To customize that layout, pass a `renderDrillThroughQuestion` prop to `InteractiveDashboard`, with your custom view as the child component.

```typescript
{% include_file "{{ dirname }}/sdk/snippets/dashboards/custom-drill-through-question-layout.tsx" snippet="example-1" %}

{% include_file "{{ dirname }}/sdk/snippets/dashboards/custom-drill-through-question-layout.tsx" snippet="example-2" %}
```

`renderDrillThroughQuestion` accepts a React component, which you can build out of the namespaced components inside `InteractiveQuestion`. See [customize the layout](./question-reference.md#customize-the-layout-of-an-interactive-chart).

## Embed an editable dashboard

An editable dashboard does everything an interactive dashboard does, and also lets people add and update questions and other cards, and rearrange the dashboard's layout.

- [Web component](#web-component-editable-dashboard)
- [React SDK](#react-sdk-editable-dashboard)

Editing requires SSO.

Whoever's editing needs [curate access](../permissions/collections.md#curate-access) to the collection the dashboard lives in. Dashboards in the [usage analytics](../usage-and-performance-tools/usage-analytics.md) collection are the exception: they're always read-only, whatever the permissions say.

People in a [tenant](./tenants.md) can only be granted **View** access to the shared collections you publish to every tenant, so they can never edit those dashboards. They can, however, edit dashboards in their own tenant collection.

If the dashboard renders but the edit pencil doesn't appear, the person viewing it lacks write access to that dashboard---check the `can_write` field on `GET /api/dashboard/:id` as that person.

### Web component editable dashboard

{% include plans-blockquote.html feature="Browser component" convert_pro_link_to_embedding=true%}

There's no `<metabase-dashboard>` attribute that turns on editing. With web components, editing comes from the [collection browser](./browser.md): set `read-only="false"`, and every dashboard people open from that browser comes with the editing pencil icon.

```html
<metabase-browser initial-collection="14" read-only="false"></metabase-browser>
```

People get to a dashboard by navigating the collection you point `initial-collection` at, so the browser is the whole embed. There's no attribute that opens the browser on one specific dashboard.

Setting `read-only="false"` also adds a **New dashboard** button, so the same embed lets people create dashboards. Check out [Add new question and new dashboard buttons](./browser.md#add-new-question-and-new-dashboard-buttons).

For the full list of attributes, see [web component attributes](./browser-reference.md#web-component-metabase-browser-attributes).

### React SDK editable dashboard

{% include plans-blockquote.html feature="Modular embedding SDK" sdk=true convert_pro_link_to_embedding=true %}

`EditableDashboard` does everything `InteractiveDashboard` does, and also lets people add and update questions, content, and the dashboard's layout. Unlike the web component, you can point it at a single dashboard, with no collection browser around it.

```typescript
{% include_file "{{ dirname }}/sdk/snippets/dashboards/editable-dashboard.tsx" %}
```

When someone adds a new question to a dashboard, `EditableDashboard` opens the query builder. To narrow what they can query, pass `dataPickerProps` with the entity types you want in the data picker. For example, limiting people to [models](../data-modeling/models.md) means they build on your curated data rather than on raw tables:

```typescript
{% include_file "{{ dirname }}/sdk/snippets/dashboards/editable-dashboard-data-picker.tsx" %}
```

For the full list of props, see [`EditableDashboard` props](./dashboard-reference.md#react-sdk-editabledashboard-props).

## Let people create dashboards

- [Web component](#web-component-dashboard-creation)
- [React SDK](#react-sdk-dashboard-creation)

### Web component dashboard creation

There's no attribute that creates a dashboard on its own. Set `read-only="false"` on the [collection browser](./browser.md#add-new-question-and-new-dashboard-buttons), and people get a **New dashboard** button. Metabase suggests whichever collection the person is browsing as the place to save it, and the new dashboard opens ready to edit.

### React SDK dashboard creation

You can let people create new dashboards from your app with either the `useCreateDashboardApi` hook or the `CreateDashboardModal` component. Both create an empty dashboard, which you'd typically hand to `EditableDashboard` so people can fill it in.

#### `useCreateDashboardApi`

Use the hook when you want total control over the UI. Until the SDK is fully loaded and initialized, the hook returns `null`, so check for that before calling `createDashboard`.

```typescript
{% include_file "{{ dirname }}/sdk/snippets/dashboards/create-dashboard.tsx" snippet="example-hook" %}
```

For the options you can pass, see [`useCreateDashboardApi` options](./dashboard-reference.md#react-sdk-usecreatedashboardapi-options).

#### `CreateDashboardModal`

Use the component when Metabase's own modal is good enough. It hands the new dashboard to `onCreate`:

```typescript
{% include_file "{{ dirname }}/sdk/snippets/dashboards/create-dashboard.tsx" snippet="example-component" %}
```

For the full list of props, see [`CreateDashboardModal` props](./dashboard-reference.md#react-sdk-createdashboardmodal-props).

## Customize the menu on dashboard cards (React SDK only)

Every card on an interactive dashboard gets an overflow menu in its top right corner, with actions like downloading results and editing the question. The `dashboardCardMenu` plugin lets you change what's in that menu, add your own actions, or replace the menu entirely. The plugin is React SDK only; there's no web component equivalent.

Pass the plugin through the `plugins` prop, under the `dashboard` key, on any dashboard component. You can also set it globally on `MetabaseProvider`; a component's own `plugins` prop wins over the global one. Here's `dashboardCardMenu` with its default values:

```typescript
{% include_file "{{ dirname }}/sdk/snippets/dashboards/plugins.tsx" snippet="example-base-2" %}
```

For what each key does, see [`dashboardCardMenu` plugin](./dashboard-reference.md#react-sdk-dashboardcardmenu-plugin).

### Turn off the default actions

To remove the download button from the menu, set `withDownloads` to `false`. To remove the edit link, set `withEditLink` to `false`.

```typescript
{% include_file "{{ dirname }}/sdk/snippets/dashboards/plugins.tsx" snippet="example-default-actions" %}
```

### Add your own actions to the menu

Add custom actions by putting objects in the `customItems` array. Each element can be an object, or a function that receives `{ question }` and returns an item:

```typescript
{% include_file "{{ dirname }}/sdk/snippets/dashboards/plugins.tsx" snippet="example-custom-action-type" %}
```

Here's an example:

```typescript
{% include_file "{{ dirname }}/sdk/snippets/dashboards/plugins.tsx" snippet="example-custom-actions" %}
```

### Replace the menu with your own component

To swap out the whole menu, pass a function that returns a React element. The function receives `{ question }`:

```typescript
{% include_file "{{ dirname }}/sdk/snippets/dashboards/plugins.tsx" snippet="example-custom-actions-menu" %}
```

### Customize what happens when someone clicks a card

To change the menu people get when they click a data point on a dashboard card, use the `mapQuestionClickActions` plugin. See [Customize what happens when someone clicks on a chart](./chart.md#customize-what-happens-when-someone-clicks-on-a-chart).

To send people somewhere instead---another dashboard, a question, or an external URL---set up a [custom destination](../dashboards/interactive.md#custom-destinations). In guest embeds, you can only use the **URL** option, and external URLs open in a new tab or window. You can propagate filter values into the URL, unless the filter is locked.

## Control dashboard filters from your app

Say you want to show each customer only their own numbers. How you filter the results depends on how you authenticate the embed.

### Lock a filter on a guest embed

Embeds with **Guest** authentication can [lock a filter](./guest-embedding.md#locked-parameters). Your app sets the filter's value in the signed token on your server, so the value comes from your app rather than from whoever's clicking around the page. They can't see the value, and they can't change it. An embed on a customer's account page returns that account's rows, whether or not Metabase has any idea who's looking at it.

Unlike a question, which needs a SQL variable to lock onto, any dashboard filter can be locked, including filters wired up to query builder questions. Set the filter to **Locked** in the dashboard's embed settings, then pass its value in the token:

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

A locked filter also narrows the options in every editable filter on the same dashboard, the way [linked filters](../dashboards/filters.md#linking-filters) do. And if the locked filter feeds a SQL question anywhere on the dashboard, the token can carry only one value for it. See [Locked parameters](./guest-embedding.md#locked-parameters).

### Use permissions on an SSO embed

Embeds with **SSO** don't need to lock filters. Since Metabase knows who's viewing, you can apply [data permissions](../permissions/embedding.md) and let Metabase filter the rows, instead of locking filters by hand.

### Set filter values from your app

To set a starting value that people can still change, or to keep your app in sync as they change it, see [Modular embedding parameters](./parameters.md).

## Let people set up dashboard subscriptions

You can let people set up [dashboard subscriptions](../dashboards/subscriptions.md) from an embedded dashboard.

- [Web component](#web-component-dashboard-subscriptions)
- [React SDK](#react-sdk-dashboard-subscriptions)

Either way, Metabase hides the subscriptions button unless all of these are true:

- Your Metabase has [email set up](../configuring-metabase/email.md). Slack on its own won't do it: the button checks for email specifically.
- The embed is an authenticated (SSO) embed. Guest embeds don't get subscriptions.
- The dashboard has at least one question card (i.e., not a text or heading card).

Whoever's viewing also needs [collection permissions](../permissions/collections.md) for the collection that holds the dashboard, and the [Subscriptions and alerts](../permissions/application.md#subscriptions-and-alerts) application permission to set one up. Metabase grants that permission to the All Users group by default, so admins have to set it to **No** to take it away.

Subscriptions sent from an embedded dashboard exclude links to Metabase items.

### Web component dashboard subscriptions

Set the [`with-subscriptions`](./dashboard-reference.md#web-component-metabase-dashboard-attributes) attribute:

```html
<metabase-dashboard
  dashboard-id="42"
  with-subscriptions="true"
></metabase-dashboard>
```

Drill-through also has to be on. Setting `drills="false"` renders a view-only dashboard, which has no subscriptions button.

### React SDK dashboard subscriptions

Pass `withSubscriptions` to a dashboard component:

```tsx
{% include_file "{{ dirname }}/sdk/snippets/dashboards/dashboard-subscriptions.tsx" snippet="example" %}
```

`StaticDashboard` takes `withSubscriptions` too, so you can show the button on a view-only dashboard.

## Refresh a dashboard automatically

To rerun a dashboard's cards on a timer, set a refresh interval in seconds. Each refresh re-queries your database, so pick an interval your database can keep up with.

- [Web component](#web-component-auto-refresh)
- [React SDK](#react-sdk-auto-refresh)

### Web component auto-refresh

Set `auto-refresh-interval`:

```html
<metabase-dashboard
  dashboard-id="42"
  auto-refresh-interval="60"
></metabase-dashboard>
```

### React SDK auto-refresh

Set `autoRefreshInterval`:

```tsx
{% include_file "{{ dirname }}/sdk/snippets/dashboards/dashboard-auto-refresh.tsx" snippet="example" %}
```

## Customize dashboard appearance

You can toggle parts of an embedded dashboard's UI and set how tall it renders.

- [Web component](#web-component-dashboard-appearance)
- [React SDK](#react-sdk-dashboard-appearance)

### Web component dashboard appearance

- **Title**: show or hide the dashboard title with `with-title`. Defaults to `true`.
- **Downloads**: show or hide the button that downloads the dashboard as a PDF, plus the download buttons on each card's results, with `with-downloads`. Defaults to `false`, so set it to `true` if you want people to be able to download results. Changing it requires a [Pro](https://www.metabase.com/product/pro) or [Enterprise](https://www.metabase.com/product/enterprise) plan.

To set the height, style the `<metabase-dashboard>` element with CSS. The element renders as a block, and the embed fills it:

```html
<style>
  metabase-dashboard {
    height: 800px;
  }
</style>

<metabase-dashboard dashboard-id="42"></metabase-dashboard>
```

The embed won't render shorter than 600 pixels, no matter which height you set.

### React SDK dashboard appearance

- **Title**: show or hide the dashboard title with `withTitle`. Defaults to `true`.
- **Card titles**: show or hide the title on each card with `withCardTitle`.
- **Downloads**: show or hide the button that downloads the dashboard as a PDF, plus the download buttons on each card's results, with `withDownloads`. Defaults to `false`, so set it to `true` if you want people to be able to download results.

Dashboard components fill the height of their container (`min-height: 100%`). Override that with the `style` or `className` props:

```tsx
{% include_file "{{ dirname }}/sdk/snippets/dashboards/custom-height.tsx" snippet="example" %}
```

### Theme an embedded dashboard

Set a light or dark preset, or (on Pro/Enterprise) customize colors and fonts. Web components take the theme in [`defineMetabaseConfig`](./appearance.md#add-an-advanced-theme-to-your-embed); the SDK takes it from [`defineMetabaseTheme`](./appearance.md#reuse-a-saved-theme-in-the-sdk) on `MetabaseProvider`. The theme object itself is the same either way.

The `dashboard` component in the theme has its own overrides:

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

Colors set in a card's visualization settings override theme colors. See also [appearance](./appearance.md).

### Remove the "Powered by Metabase" banner

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
