---
title: Embed a chart
summary: "Embed a single Metabase chart in your app, either view-only or interactive, with a web component or using the React SDK."
redirect_from:
  - /docs/latest/embedding/sdk/questions
  - /docs/latest/embedding/question
---

# Embed a chart

There are two ways you can embed a chart (called a question, in Metabase parlance):

- [View-only chart](#embed-a-view-only-chart): people see the results, filter them, and that's it.
- [Interactive chart](#embed-an-interactive-chart): people can drill through the chart and change the query behind it.

## Embed a view-only chart

![Static question](./images/static-question.png)

A view-only (a.k.a. "static") chart displays results without letting people explore the data. Nobody can drill through it, change the query behind it, or run a new one. You can, however, add editable filters that people can change to update the query results.

View-only isn't tied to one kind of embed. You can make a chart view-only in any embedding type:

- **[Guest embeds](./introduction.md#components-with-guest-authentication)**: always view-only. Nobody logs in to a guest embed, so Metabase has no account to check permissions against, and no way to tell whether a new query is one that person should be allowed to run. The published question is the only thing Metabase can safely run, which is why there's no drill-through or ad-hoc querying to turn off.
- **[SSO embeds](./introduction.md#components-with-sso-authentication)**: interactive out of the box. To make one view-only, turn off drill-through with `drills="false"` (web component) or `drills={false}` (SDK), and turn off saving with `is-save-enabled="false"` or `isSaveEnabled={false}`. You can also manage what people can do through [data permissions](../permissions/data.md) and [collection permissions](../permissions/collections.md).

So pick your authentication based on what your app needs---plans, permissions, whether Metabase should know who's viewing---not on whether you want a view-only chart. Check out [SSO or guest embeds](./introduction.md#comparison-between-sso-and-guest-authentication).

This section covers setting up a view-only chart with guest authentication.

- [Web components](#view-only-charts-with-guest-authentication-using-a-web-component)
- [React SDK](#view-only-charts-using-the-react-sdk)

### View-only charts with guest authentication using a web component

You can use the in-app wizard to set up a view-only chart using web components.

![In-app embedding wizard](./images/in-app-embedding-wizard.png)

Three things need to happen: you publish the embed in Metabase, you paste the chart code into your app, and your server signs a JWT. The wizard writes most of the code for you, so the list below is longer than the work.

1. Visit the question in your Metabase.
2. Click the **Share** icon in the upper right.
3. Select **Embed** to open the embedding wizard.
4. For authentication, choose **Guest**, so your app won't need to log anyone in to your Metabase. An admin needs to [turn on guest embedding](./guest-embedding.md#turning-on-guest-embedding-in-metabase) first.
5. Click the **Publish** button. Publishing only applies to guest embeds.
6. Under behavior, Metabase gives you several options for customizing how the embed works. See [web component attributes](./question-reference.md#web-component-metabase-question-attributes) for what each one does. If you'd picked SSO in step 4, this is where you'd make the embed view-only by turning off drill-through.
7. If you're embedding a SQL question with a variable, set the parameter to **Editable** or **Locked**. Parameters are **Disabled** by default, which hides them and prevents your server from setting them. See [Parameters differ between guest and SSO embeds](./parameters.md#parameters-differ-between-guest-and-sso-embeds).
8. Customize the [appearance](./appearance.md).
9. Click the **Get code** button. You'll get both the frontend and backend code based on the selections you made in the wizard.
10. Copy the client code and paste it in your app.
11. Replace the JWT the wizard pasted into your HTML. That token is a fixed string with an expiration baked into it, so an embed that ships with it will stop working. Either sign a fresh token on your server for each page load and render it into the `token` attribute, or leave the attribute off and point [`guestEmbedProviderUri`](./guest-embedding.md#refreshing-or-initializing-the-jwt-from-your-server) at an endpoint in your app, which also keeps the embed alive past the expiration. The example below takes the first route; for the second, see [Embed a dashboard](./dashboard.md#web-component-view-only-dashboard-example).

#### View-only chart example with web components

Say you have a question written in SQL, with a field filter to filter orders by `customer_id`:

```sql
{% raw %}
SELECT
  *
FROM
  orders
WHERE
  {{customer_id}}
{% endraw %}
```

Now say you want to embed this question on each customer's account page in your app, showing only that customer's orders. Here's the frontend code.

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
Your server signs this token for each page load and renders it here. Don't
paste a fixed JWT into your HTML: it'll stop working once it expires.
-->
<metabase-question
  token="PASS_SIGNED_TOKEN_FROM_SERVER"
  with-title="true"
  with-downloads="true"
>
</metabase-question>
```

The `theme` key sets the chart's appearance. For the full theme object with all the options, check out [Appearance](./appearance.md).

On your app's server, set the value for the locked parameter in the token. Whoever's looking at the page can't see or change that value, so an embed on customer 13's account page returns only customer 13's orders.

```js
// you will need to install via 'npm install jsonwebtoken' or in your package.json

const jwt = require("jsonwebtoken");

// Get your key from your Metabase at
// /admin/embedding/guest -> Embedding secret key
const METABASE_SECRET_KEY = "YOUR_SECRET_KEY";

// Here we lock a customer_id parameter to 13
const payload = {
  resource: { question: 40956 },
  params: {
    customer_id: [
      13, // set this programmatically, based on whose account page your app is rendering
    ],
  },
  exp: Math.round(Date.now() / 1000) + 10 * 60, // 10 minute expiration
};
const token = jwt.sign(payload, METABASE_SECRET_KEY);
```

To get this code from the in-app wizard, set the `customer_id` parameter to **Locked** and publish the question. See [Locked parameters](./parameters.md#restrict-data-on-guest-embeds).

For all modular embeds, you can also set a `locale` in your page-level configuration to [translate embedded content](./translations.md).

For the full list of attributes, see [web component attributes](./question-reference.md#web-component-metabase-question-attributes).

### View-only charts using the React SDK

{% include plans-blockquote.html feature="Modular embedding SDK" sdk=true convert_pro_link_to_embedding=true %}

To embed a view-only chart with the [SDK](./sdk/introduction.md), use the `StaticQuestion` component. Wrap the component in the `MetabaseProvider` component with your auth config.

```typescript
{% include_file "{{ dirname }}/sdk/snippets/questions/static-question.tsx" %}
```

The component has a default height, which you can change with the `height` prop. To inherit the height from the parent container, pass `100%`.

For the full list of props, see [`StaticQuestion` props](./question-reference.md#react-sdk-staticquestion-props).

## Embed an interactive chart

{% include plans-blockquote.html feature="Interactive charts" convert_pro_link_to_embedding=true is_plural=true %}

An interactive chart lets people explore their data: they can drill through the chart, filter results, summarize and group them, change visualization settings, and optionally save their changes.

Interactive charts require SSO, which you can set up with either web components or the React SDK.

- [Web components](#interactive-charts-using-a-web-component)
- [React SDK](#interactive-charts-using-the-react-sdk)

### Interactive charts using a web component

Reference an existing question by ID. [Drill-through](../questions/visualizations/drill-through.md) is on by default:

```html
<metabase-question question-id="1"></metabase-question>
```

`question-id` takes the question's sequential ID — the number in the question's URL. On Pro and Enterprise plans, you can use the question's [entity ID](../installation-and-operation/serialization.md#entity-ids-work-with-embedding) instead; entity IDs stay the same when you [serialize](../installation-and-operation/serialization.md) content from one Metabase to another, like from staging to production.

To control what people can do with the chart, check out [web component attributes](./question-reference.md#web-component-metabase-question-attributes). For example, you can show or hide download buttons, the question's title, or the chart type selector.

### Interactive charts using the React SDK

Use `InteractiveQuestion` when you want people to explore their data and customize the layout.

![Interactive question](./images/interactive-question.png)

```typescript
{% include_file "{{ dirname }}/sdk/snippets/questions/interactive-question.tsx" %}
```

For the full list of props, see [`InteractiveQuestion` props](./question-reference.md#react-sdk-interactivequestion-props).

#### Customize the layout of an interactive chart

`InteractiveQuestion` comes with a default layout that lets people view the question, apply filters and aggregations, and use the query builder. You can also build your own layout out of namespaced components like `<InteractiveQuestion.Filter />`. For examples of both, see [Customizing an interactive chart's layout](./question-reference.md#customize-the-layout-of-an-interactive-chart), and the full list of [`InteractiveQuestion` components](./question-reference.md#react-sdk-interactivequestion-components).

### Let people save their changes

If you're using embeds with SSO, you can let people save their work.

### Saving with web components

With a web component, turn saving on with `is-save-enabled="true"`, and set the collection that saved questions land in with `target-collection`:

```html
<metabase-question
  question-id="1"
  is-save-enabled="true"
  target-collection="5"
></metabase-question>
```

### Saving with the React SDK

With the SDK, you get four props to control saving questions:

- `isSaveEnabled` shows or hides the save button.
- `onBeforeSave` runs before a save (it can be async).
- `onSave` runs after a successful save. It receives the updated question and a context object with `isNewQuestion`.
- `targetCollection` pre-selects the collection to save to and hides the collection picker.

To prevent people from saving changes (or saving as a new question), set `isSaveEnabled={false}`:

```tsx
{% include_file "{{ dirname }}/sdk/snippets/questions/disable-question-save.tsx" %}
```

In the embedding wizard, this corresponds to the **Allow people to save new questions** option.

## Customize what happens when someone clicks on a chart

Customizing click behavior is only available in the [Modular embedding SDK](./sdk/introduction.md) for now.

When people click a data point in an interactive chart, Metabase shows a menu of actions. The [`mapQuestionClickActions`](./sdk/plugins.md) plugin lets you customize this: open the default menu, add custom actions, or perform an immediate action without a menu.

Use it globally on `MetabaseProvider`, or on individual `InteractiveQuestion` components:

```typescript
{% include_file "{{ dirname }}/sdk/snippets/questions/interactive-question-click-actions.tsx" snippet="example" %}
```

You can also customize how custom actions look in the menu:

```typescript
{% include_file "{{ dirname }}/sdk/snippets/questions/interactive-question-plugins.tsx" snippet="example" %}
```

## Embed the query builder or SQL editor

To let people build questions from scratch, check out [Embed the query builder](./query-builder.md).

## Show people only their own data

Say you want to show each customer only their own orders. How you restrict the rows depends on how you authenticate the embed.

### Lock a parameter on a guest embed

Embeds with **Guest** authentication can [lock a parameter](./parameters.md#restrict-data-on-guest-embeds). Your app sets the parameter's value in the signed token on your server, so the filter is controlled by your app rather than by whoever's clicking around the page. They can't see the value, and they can't change it. An embed on a customer's account page returns that account's rows, whether or not Metabase has any idea who's looking at it.

Locked parameters need a question written in SQL, with a [field filter or variable](../questions/native-editor/sql-parameters.md) to lock onto. Query builder questions have no parameters to lock, so segregate their data with permissions instead.

```javascript
const payload = {
  resource: { question: 5 },
  params: {
    category: ["Gadget"], // Locked. Set by your app, not by whoever's viewing.
  },
  exp: Math.round(Date.now() / 1000) + 10 * 60,
};

const token = jwt.sign(payload, METABASE_SECRET_KEY);
```

### Use permissions on an SSO embed

Embeds with **SSO** don't need to lock parameters. Since Metabase knows who's viewing, you can apply [data permissions](../permissions/embedding.md) and let Metabase filter the rows, instead of locking parameters by hand. This works for query builder questions and SQL questions alike.

## Control question parameters from your app

To drive a question's [SQL parameters](../questions/native-editor/sql-parameters.md) from your app's own code, pass values keyed by variable name. You can [set starting values](./parameters.md#set-starting-values) that people can still change, [hold the values in your app](./parameters.md#control-values-from-your-app) and get a callback whenever they change, and [hide Metabase's widgets](./parameters.md#hide-parameter-widgets) when your app supplies [its own](./parameters.md#build-your-own-filter-ui). Check out [Embedding parameters](./parameters.md) for all of it.

Your app sets these values in the browser, and people can change them, so they don't restrict what anyone can query. To restrict the data itself, see [Show people only their own data](#show-people-only-their-own-data).

## Let people set up alerts on a question

You can let people set up [alerts](../questions/alerts.md) on a saved question with the [`with-alerts`](./question-reference.md#web-component-metabase-question-attributes) attribute on the web component:

```html
<metabase-question question-id="42" with-alerts="true"></metabase-question>
```

Or by passing `withAlerts` to `StaticQuestion` or `InteractiveQuestion` in the SDK:

```tsx
<MetabaseProvider authConfig={authConfig}>
  <InteractiveQuestion questionId={42} withAlerts />
</MetabaseProvider>
```

Metabase only shows the alerts button when all of these are true:

- Your Metabase has [email set up](../configuring-metabase/email.md).
- The embed is an authenticated (SSO) embed.
- The person viewing the embed is in a group with the [Subscriptions and alerts](../permissions/application.md#subscriptions-and-alerts) application permission. Metabase grants this permission to the All Users group by default, so admins have to set it to **No** to take it away.
- The person viewing the embed has [collection permissions](../permissions/collections.md) for the collection that holds the question.

Alerts created in an embedded context only send to whoever's logged in, and they exclude links to Metabase items.

## Customize chart appearance

You can theme an embedded question and toggle parts of its UI. For the full set of theming options, see [Appearance](./appearance.md). For every attribute and prop, see the [Question component reference](./question-reference.md).

- **Title**: show or hide the question title with `with-title` (web component) or `title` (SDK).
- **Downloads**: show or hide download buttons with `with-downloads` / `withDownloads`. Defaults to `false` on Pro and Enterprise, so set it to `true` if you want people to be able to download results. On OSS and Starter, downloads are always on; turning them off requires a [Pro](https://www.metabase.com/product/pro) or [Enterprise](https://www.metabase.com/product/enterprise) plan.
- **Chart type selector**: show or hide it with `withChartTypeSelector` (SDK).
- **Theme**: set a light or dark preset, or (on Pro/Enterprise) customize colors and fonts. The `question` component in the theme has its own overrides:

```js
{
  components: {
    question: {
      // Background color for all questions
      backgroundColor: "#2E353B",

      // Toolbar of the default interactive question layout
      toolbar: {
        backgroundColor: "#F3F5F7",
      },
    },
  },
}
```

Colors set in a question's visualization settings override theme colors.

On the OSS and Starter plans, Metabase adds a "Powered by Metabase" banner to guest embeds. See [Removing the "Powered by Metabase" banner](./guest-embedding.md#removing-the-powered-by-metabase-banner).

## Further reading

- [Question component reference](./question-reference.md)
- [Embed a dashboard](./dashboard.md)
- [Embed the query builder](./query-builder.md)
- [Appearance](./appearance.md)
- [Embedding parameters](./parameters.md)
- [Parameters reference](./parameters-reference.md)
- [Translating embeds](./translations.md)
- [Guest embeds](./guest-embedding.md)
- [Authentication](./authentication.md)
- [Modular embedding SDK](./sdk/introduction.md)
- [Modular embedding components](./components.md)
- [Embed an AI chat](./ai-chat.md)
