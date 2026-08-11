---
title: Dashboard component reference
summary: "Reference for the metabase-dashboard web component attributes, the StaticDashboard, InteractiveDashboard, and EditableDashboard SDK props, and the dashboard creation components."
---

# Dashboard component reference

Reference material for embedding a dashboard: the attributes you can set on the `<metabase-dashboard>` web component, the props you can pass to the SDK's `StaticDashboard`, `InteractiveDashboard`, and `EditableDashboard` components, and the options for creating dashboards from your app.

For how to set all this up, check out [Embed a dashboard](./dashboard.md).

## `metabase-dashboard` web component attributes

These attributes apply to the `<metabase-dashboard>` web component. For the SDK, see [`StaticDashboard` props](#staticdashboard-props), [`InteractiveDashboard` props](#interactivedashboard-props), and [`EditableDashboard` props](#editabledashboard-props).

{% include_file "{{ dirname }}/eajs/snippets/MetabaseDashboardAttributes.md" snippet="properties" %}

Depending on the framework you're using, you may need to stringify attributes before passing them to the component. And if you surround an attribute's value with double quotes, use single quotes inside it:

```html
<metabase-dashboard
  dashboard-id="1"
  initial-parameters="{ 'productId': '42' }"
></metabase-dashboard>
```

```html
<metabase-dashboard
  dashboard-id="1"
  hidden-parameters="['productId']"
></metabase-dashboard>
```

For all modular embeds, you can also set a `locale` in your page-level configuration to [translate embedded content](./translations.md), including content from translation dictionaries.

## `StaticDashboard` props

{% include plans-blockquote.html feature="Modular embedding SDK" sdk=true convert_pro_link_to_embedding=true %}

`StaticDashboard` embeds a [view-only dashboard](./dashboard.md#embed-a-view-only-dashboard): a lightweight component that displays results without letting people interact with the data.

- [Component](./sdk/api/StaticDashboard.html)
- [Props](./sdk/api/StaticDashboardProps.html)

{% include_file "{{ dirname }}/sdk/api/snippets/StaticDashboardProps.md" snippet="properties" %}

## `InteractiveDashboard` props

{% include plans-blockquote.html feature="Interactive dashboards" convert_pro_link_to_embedding=true is_plural=true %}

`InteractiveDashboard` embeds an [interactive dashboard](./dashboard.md#embed-an-interactive-dashboard), with drill-downs, click behaviors, and the ability to view and click into questions.

- [Component](./sdk/api/InteractiveDashboard.html)
- [Props](./sdk/api/InteractiveDashboardProps.html)

{% include_file "{{ dirname }}/sdk/api/snippets/InteractiveDashboardProps.md" snippet="properties" %}

## `EditableDashboard` props

{% include plans-blockquote.html feature="Modular embedding SDK" sdk=true convert_pro_link_to_embedding=true %}

`EditableDashboard` does everything `InteractiveDashboard` does, and also lets people [edit the dashboard](./dashboard.md#let-people-edit-dashboards): add and update questions, layout, and content.

- [Component](./sdk/api/EditableDashboard.html)
- [Props](./sdk/api/EditableDashboardProps.html)

{% include_file "{{ dirname }}/sdk/api/snippets/EditableDashboardProps.md" snippet="properties" %}

## `CreateDashboardModal` props

{% include plans-blockquote.html feature="Modular embedding SDK" sdk=true convert_pro_link_to_embedding=true %}

`CreateDashboardModal` lets people [create a new dashboard](./dashboard.md#createdashboardmodal) from your app.

- [Component](./sdk/api/CreateDashboardModal.html)
- [Props](./sdk/api/CreateDashboardModalProps.html)

{% include_file "{{ dirname }}/sdk/api/snippets/CreateDashboardModalProps.md" snippet="properties" %}

## `useCreateDashboardApi` options

{% include plans-blockquote.html feature="Modular embedding SDK" sdk=true convert_pro_link_to_embedding=true %}

`useCreateDashboardApi` [creates a dashboard](./dashboard.md#usecreatedashboardapi) without Metabase's own modal, so you can build your own UI.

- [Hook](./sdk/api/useCreateDashboardApi.html)
- [Options](./sdk/api/CreateDashboardValues.html)

{% include_file "{{ dirname }}/sdk/api/snippets/CreateDashboardValues.md" snippet="properties" %}

## `dashboardCardMenu` plugin

{% include plans-blockquote.html feature="Modular embedding SDK" sdk=true convert_pro_link_to_embedding=true %}

`dashboardCardMenu` controls the overflow menu on each dashboard card. Pass it to `InteractiveDashboard` (or `EditableDashboard`) through the `plugins` prop, under the `dashboard` key. It takes either a config object or a function returning a React component:

```typescript
{% include_file "{{ dirname }}/sdk/snippets/dashboards/plugins.tsx" snippet="example-base-1" %}
```

| Key             | What it does                                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `withDownloads` | Shows or hides the download button.                                                                                      |
| `withEditLink`  | Shows or hides the link to edit the question.                                                                            |
| `customItems`   | Your own menu items. Each element is either an item object or a function that takes the card's question and returns one. |

For examples, see [Customize the menu on dashboard cards](./dashboard.md#customize-the-menu-on-dashboard-cards).

## Further reading

- [Embed a dashboard](./dashboard.md)
- [Embed the query builder](./query-builder.md)
- [Question component reference](./question-reference.md)
- [Modular embedding components](./components.md)
- [Modular embedding parameters](./parameters.md)
- [Appearance](./appearance.md)
