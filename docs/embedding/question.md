---
title: Embed a chart
summary: "Embed a single Metabase chart in your app, either view-only or interactive, with a web component or using the React SDK."
redirect_from:
  - /docs/latest/embedding/sdk/questions
---

# Embed a chart

A saved chart in Metabase is called a question, so the component that embeds one is called a question component: `<metabase-question>` if you're using web components, or `StaticQuestion` and `InteractiveQuestion` if you're using the [React SDK](./sdk/introduction.md). Whatever you call it, what lands on your page is a single chart, table, or other visualization.

You can embed a chart two ways:

- [View-only chart](#embed-a-view-only-chart): people see the results, and that's it.
- [Interactive chart](#embed-an-interactive-chart): people can drill through the chart and change the query behind it.

To let people build questions from scratch instead, check out [Embed the query builder](./query-builder.md). To embed an AI chat component, check out [AI chat](./sdk/ai-chat.md).

## Embed a view-only chart

![Static question](./images/static-question.png)

A view-only (a.k.a. "static") chart displays results without letting people explore the data. Nobody can drill through it, change the query behind it, or run a new one. You can still add editable filters that people can change.

View-only isn't tied to one kind of embed. You can make a chart view-only in any embedding type:

- **Guest embeds** are always view-only. Guest embeds have no drill-through or ad-hoc querying to turn off.
- **SSO embeds** are interactive out of the box. To make one view-only, turn off drill-through with `drills="false"` (web component) or `drills={false}` (SDK), and turn off saving with `is-save-enabled="false"` or `isSaveEnabled={false}`.

So pick your authentication based on what your app needs — plans, permissions, whether Metabase should know who's viewing — not on whether you want a view-only chart. Check out [SSO or guest embeds](./introduction.md#comparison-between-sso-and-guest-embeds).

The rest of this section walks through a guest embed, since that's what the in-app wizard sets up.

- [Web components](#view-only-charts-using-a-web-component)
- [React SDK](#view-only-charts-using-the-react-sdk)

### View-only charts using a web component

You can use the in-app wizard to set up a view-only chart using web components.

![In-app embedding wizard](./images/in-app-embedding-wizard.png)

Before you start, an admin needs to [turn on guest embedding](./guest-embedding.md#turning-on-guest-embedding-in-metabase).

1. Visit the question in your Metabase.
2. Click the **Share** icon in the upper right.
3. Select **Embed** to open the embedding wizard.
4. For authentication, choose **Guest**, so your app won't need to log anyone in to your Metabase.
5. Click the **Publish** button. Publishing only applies to guest embeds; there's nothing to publish for an SSO embed.
6. Under behavior, Metabase gives you several options for customizing how the embed works. See [web component attributes](#web-component-attributes) for what each one does. If you'd picked SSO in step 4, this is where you'd make the embed view-only by turning off drill-through.
7. If you're embedding a SQL question with a variable, set the parameter to **Editable** or **Locked**. Parameters are **Disabled** by default, which hides them and prevents your server from setting them. See [Configuring parameters](./guest-embedding.md#configuring-parameters).
8. Customize the [appearance](./appearance.md).
9. Click the **Get code** button. You'll get both the frontend and backend code based on the selections you made in the wizard.
10. Copy the client code and paste it in your app.
11. Remove the hardcoded JWT tokens in your HTML. Fetch the token from your backend and pass the token to the component programmatically.

To keep an embed alive after its token expires, configure a token endpoint with [`guestEmbedProviderUri`](./guest-embedding.md#refreshing-or-initializing-the-jwt-from-your-server).

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

Now say you want to drop this question on each customer's account page in your app, showing only that customer's orders. Here's the frontend code.

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
Fetch the JWT token from your backend and programmatically pass it to the 'metabase-question'.
-->
<metabase-question
  token="PASS_SIGNED_TOKEN_FROM_SERVER"
  with-title="true"
  with-downloads="true"
>
</metabase-question>
```

The `theme` key sets the chart's appearance. Two colors are enough to show the shape of it; for the full theme object with all the options, check out [Appearance](./appearance.md).

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

To get this code from the in-app wizard, set the `customer_id` parameter to **Locked** and publish the question. See [Locked parameters](./guest-embedding.md#locked-parameters).

For all modular embeds, you can also set a `locale` in your page-level configuration to [translate embedded content](./translations.md).

For the full list of attributes, see [web component attributes](#web-component-attributes).

### View-only charts using the React SDK

{% include plans-blockquote.html feature="Modular embedding SDK" sdk=true convert_pro_link_to_embedding=true %}

To embed a view-only chart with the [SDK](./sdk/introduction.md), use the `StaticQuestion` component. Wrap the component in the `MetabaseProvider` component with your auth config.

```typescript
{% include_file "{{ dirname }}/sdk/snippets/questions/static-question.tsx" %}
```

The component has a default height, which you can change with the `height` prop. To inherit the height from the parent container, pass `100%`.

#### `StaticQuestion` props

{% include_file "{{ dirname }}/sdk/api/snippets/StaticQuestionProps.md" snippet="properties" %}

## Embed an interactive chart

{% include plans-blockquote.html feature="Interactive charts" convert_pro_link_to_embedding=true is_plural=true %}

An interactive chart lets people explore their data: they can drill through the chart, filter results, summarize and group them, change visualization settings, and optionally save their changes.

Interactive charts need an [SSO embed](./modular-embedding.md), which you can set up with either web components or the React SDK. Guest embeds are always view-only.

- [Web components](#interactive-charts-using-a-web-component)
- [React SDK](#interactive-charts-using-the-react-sdk)

### Interactive charts using a web component

Reference an existing question by ID. [Drill-through](../questions/visualizations/drill-through.md) is on by default:

```html
<metabase-question question-id="Xk3YzAbCdEfGhIjKlMnOp"></metabase-question>
```

You can pass a sequential ID like `1`, but an [entity ID](../installation-and-operation/serialization.md#entity-ids-work-with-embedding) is the better bet: entity IDs stay the same when you move content between instances, like from staging to production.

To control what people can do with the chart, check out [web component attributes](#web-component-attributes).

### Interactive charts using the React SDK

Use `InteractiveQuestion` when you want people to explore their data and customize the layout.

![Interactive question](./images/interactive-question.png)

```typescript
{% include_file "{{ dirname }}/sdk/snippets/questions/interactive-question.tsx" %}
```

#### Customize what happens when someone clicks on a chart

When people click a data point in an interactive chart, Metabase shows a menu of actions. With the SDK, the [`mapQuestionClickActions`](./sdk/plugins.md) plugin lets you customize this: open the default menu, add custom actions, or perform an immediate action without a menu.

Use it globally on `MetabaseProvider`, or on individual `InteractiveQuestion` components:

```typescript
{% include_file "{{ dirname }}/sdk/snippets/questions/interactive-question-click-actions.tsx" snippet="example" %}
```

You can also customize how custom actions look in the menu:

```typescript
{% include_file "{{ dirname }}/sdk/snippets/questions/interactive-question-plugins.tsx" snippet="example" %}
```

#### `InteractiveQuestion` props

{% include_file "{{ dirname }}/sdk/api/snippets/InteractiveQuestionProps.md" snippet="properties" %}

#### Customize the layout of an interactive chart

By default, `InteractiveQuestion` comes with a layout that lets people view the question, apply filters and aggregations, and use the query builder:

```typescript
{% include_file "{{ dirname }}/sdk/snippets/questions/customize-interactive-question.tsx" snippet="example-default-interactive-question" %}
```

To build your own layout, use namespaced components inside `InteractiveQuestion` (like `<InteractiveQuestion.Filter />`):

```typescript
{% include_file "{{ dirname }}/sdk/snippets/questions/customize-interactive-question.tsx" snippet="example-customized-interactive-question" %}
```

#### `InteractiveQuestion` components

These components are available via the `InteractiveQuestion` namespace (like `<InteractiveQuestion.Filter />`). Use them to [customize the layout](#customize-the-layout-of-an-interactive-chart) of an interactive question.

- [InteractiveQuestion.AlertsButton](./sdk/api/InteractiveQuestion.html#alertsbutton)
- [InteractiveQuestion.Breakout](./sdk/api/InteractiveQuestion.html#breakout)
- [InteractiveQuestion.BreakoutDropdown](./sdk/api/InteractiveQuestion.html#breakoutdropdown)
- [InteractiveQuestion.ChartTypeDropdown](./sdk/api/InteractiveQuestion.html#charttypedropdown)
- [InteractiveQuestion.ChartTypeSelector](./sdk/api/InteractiveQuestion.html#charttypeselector)
- [InteractiveQuestion.DownloadWidget](./sdk/api/InteractiveQuestion.html#downloadwidget)
- [InteractiveQuestion.DownloadWidgetDropdown](./sdk/api/InteractiveQuestion.html#downloadwidgetdropdown)
- [InteractiveQuestion.Editor](./sdk/api/InteractiveQuestion.html#editor)
- [InteractiveQuestion.EditorButton](./sdk/api/InteractiveQuestion.html#editorbutton)
- [InteractiveQuestion.Filter](./sdk/api/InteractiveQuestion.html#filter)
- [InteractiveQuestion.FilterDropdown](./sdk/api/InteractiveQuestion.html#filterdropdown)
- [InteractiveQuestion.NavigationBackButton](./sdk/api/InteractiveQuestion.html#navigationbackbutton)
- [InteractiveQuestion.QuestionSettings](./sdk/api/InteractiveQuestion.html#questionsettings)
- [InteractiveQuestion.QuestionSettingsDropdown](./sdk/api/InteractiveQuestion.html#questionsettingsdropdown)
- [InteractiveQuestion.QuestionVisualization](./sdk/api/InteractiveQuestion.html#questionvisualization)
- [InteractiveQuestion.ResetButton](./sdk/api/InteractiveQuestion.html#resetbutton)
- [InteractiveQuestion.SaveButton](./sdk/api/InteractiveQuestion.html#savebutton)
- [InteractiveQuestion.SaveQuestionForm](./sdk/api/InteractiveQuestion.html#savequestionform)
- [InteractiveQuestion.SqlParametersList](./sdk/api/InteractiveQuestion.html#sqlparameterslist)
- [InteractiveQuestion.Summarize](./sdk/api/InteractiveQuestion.html#summarize)
- [InteractiveQuestion.SummarizeDropdown](./sdk/api/InteractiveQuestion.html#summarizedropdown)
- [InteractiveQuestion.Title](./sdk/api/InteractiveQuestion.html#title)
- [InteractiveQuestion.VisualizationButton](./sdk/api/InteractiveQuestion.html#visualizationbutton)

[InteractiveQuestion.BackButton](./sdk/api/InteractiveQuestion.html#backbutton) is deprecated. Use `InteractiveQuestion.NavigationBackButton` instead.

### Let people save their changes

Saving works the opposite way in each setup: it's on by default in the SDK's `InteractiveQuestion`, and off by default in the `<metabase-question>` web component.

With a web component, turn saving on with `is-save-enabled="true"`, and set the collection that saved questions land in with `target-collection`:

```html
<metabase-question
  question-id="Xk3YzAbCdEfGhIjKlMnOp"
  is-save-enabled="true"
  target-collection="5"
></metabase-question>
```

With the SDK, you get four props instead:

- `isSaveEnabled` shows or hides the save button.
- `onBeforeSave` runs before a save (it can be async).
- `onSave` runs after a successful save. It receives the updated question and a context object with `isNewQuestion`.
- `targetCollection` pre-selects the collection to save to and hides the collection picker.

`onBeforeSave` and `onSave` have no web component equivalent, so reach for the SDK if you need to run your own code around a save.

To prevent people from saving changes (or saving as a new question), set `isSaveEnabled={false}`:

```tsx
{% include_file "{{ dirname }}/sdk/snippets/questions/disable-question-save.tsx" %}
```

In the embed wizard, this corresponds to the **Allow people to save new questions** option.

## Filter results based on your app's context

To show each customer only their own data, you have two options, depending on how you authenticate.

**Guest embeds** can [lock a parameter](./guest-embedding.md#locked-parameters). Your app sets the parameter's value in the signed token on your server, so the filter is controlled by your app rather than by whoever's clicking around the page. They can't see the value, and they can't change it. That's what makes locked parameters worth using: an embed on a customer's account page returns that account's rows, whether or not Metabase has any idea who's looking at it.

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

**SSO embeds** identify each viewer with their own Metabase account, so you can apply [data permissions](../permissions/embedding.md), [row and column security](../permissions/row-and-column-security.md), and [database routing](../permissions/database-routing.md) instead of locking parameters by hand.

## Embed the query builder or SQL editor

To let people build questions from scratch, rather than explore one you've already saved, check out [Embed the query builder](./query-builder.md).

## Use your app to control parameters

You can pass values to a question's [SQL parameters](../questions/native-editor/sql-parameters.md) in the format `{parameter_name: parameter_value}`, and keep your app in sync as people change them.

> SQL parameters only work with native SQL questions, not query-builder questions.

### Controlling parameters with the SDK

`initialSqlParameters` sets the values once on load (uncontrolled). Your app won't know when people change them:

```typescript
{% include_file "{{ dirname }}/snippets/parameters/questions/initial-sql-parameters.tsx" snippet="example" %}
```

`sqlParameters` with `onSqlParametersChange` works like a controlled `<input value onChange>`: your app holds the source of truth, and you get a callback whenever applied values change:

```typescript
{% include_file "{{ dirname }}/snippets/parameters/questions/controlled-sql-parameters.tsx" snippet="example-controlled" %}
```

`onSqlParametersChange` receives the [SQL question parameter change payload](./parameters.md#sql-question-parameter-change-payload). For how values are resolved (clearing, defaults, missing slugs), see [Modular embedding parameters](./parameters.md#how-parameter-values-are-resolved).

### Controlling parameters with web components

Seed values once with the `initial-sql-parameters` attribute:

```html
<metabase-question
  question-id="42"
  initial-sql-parameters='{"product_id": 50}'
></metabase-question>
```

To push values at runtime (controlled), set the `sqlParameters` property on the element instead of the attribute, and listen for the `sql-parameters-change` event. See [Modular embedding parameters](./parameters.md#modular-embedding-web-components) for the full pattern.

### Hide a parameter

To hide a parameter from the question's UI, use the `hidden-parameters` attribute (web component) or the `hiddenParameters` prop (SDK). Both require a Pro or Enterprise plan and an SSO embed; `hidden-parameters` has no effect on a guest embed. To hide a parameter on a guest embed, set the parameter to **Locked** or leave it **Disabled** in the question's embed settings.

## Let people set up alerts on a question

You can let people set up [alerts](../questions/alerts.md) on a saved question by passing `withAlerts` to `StaticQuestion` or `InteractiveQuestion`, or the `with-alerts` attribute on the web component.

Metabase only shows the alerts button when all of these are true:

- Your Metabase has [email set up](../configuring-metabase/email.md).
- The embed is an authenticated (SSO) embed.
- The person viewing the embed has permission to create subscriptions and alerts.

Alerts created in an embedded context only send to whoever's logged in, and they exclude links to Metabase items.

```tsx
<MetabaseProvider authConfig={authConfig}>
  <InteractiveQuestion questionId={42} withAlerts />
</MetabaseProvider>
```

## Web component attributes

These attributes apply to the `<metabase-question>` web component. For the SDK, see [`StaticQuestion` props](#staticquestion-props) and [`InteractiveQuestion` props](#interactivequestion-props).

{% include_file "{{ dirname }}/eajs/snippets/MetabaseQuestionAttributes.md" snippet="properties" %}

## Customize chart appearance

You can theme an embedded question and toggle parts of its UI. For the full set of theming options, see [Appearance](./appearance.md).

- **Title**: show or hide the question title with `with-title` (web component) or `title` (SDK).
- **Downloads**: show or hide download buttons with `with-downloads` / `withDownloads`. Defaults to `true` on OSS/Starter and `false` on Pro/Enterprise. Disabling downloads requires a [Pro](https://www.metabase.com/product/pro) or [Enterprise](https://www.metabase.com/product/enterprise) plan.
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

### The "Powered by Metabase" banner

Metabase adds a "Powered by Metabase" banner to guest embeds (both charts and dashboards) on the OSS and Starter plans. To remove the banner, upgrade to a [Pro](https://www.metabase.com/product/pro) or [Enterprise](https://www.metabase.com/product/enterprise) plan.

## Further reading

- [Embed the query builder](./query-builder.md)
- [Appearance](./appearance.md)
- [Modular embedding parameters](./parameters.md)
- [Guest embeds](./guest-embedding.md)
- [Authentication](./authentication.md)
- [Modular embedding SDK](./sdk/introduction.md)
- [AI chat](./sdk/ai-chat.md)
