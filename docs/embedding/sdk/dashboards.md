---
title: "Embedded analytics SDK - dashboards"
---

# Embedded analytics SDK - dashboards

{% include plans-blockquote.html feature="Embedded analytics SDK" sdk=true %}

You can embed an interactive, editable, or static dashboard.

**Please keep in mind - embedding multiple instances of dashboards on the same page is not yet supported.**

## Embedding a dashboard

You can embed a dashboard using the one of the dashboard components:

- `StaticDashboard`

A lightweight dashboard component. Use this component when you want to display results without letting people interact with the data.

- `InteractiveDashboard`

A dashboard component with drill downs, click behaviors, and the ability to view and click into questions. Use this component when you want to allow people to explore their data.

- `EditableDashboard`

A dashboard component with the features available in the `InteractiveDashboard` component, as well as the ability to add and update questions, layout, and content within your dashboard. Use this component when you want to give people the ability to modify your dashboards, for example in an admin panel in your app.

## Dashboard component props

| Prop                         | Type                                                        | Description                                                                                                                                                                                                                                                                                                                      |
| ---------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| dashboardId                  | `number \| string`                                          | The ID of the dashboard. This is either:<br>- the numerical ID when accessing a dashboard link, i.e. `http://localhost:3000/dashboard/1-my-dashboard` where the ID is `1`<br>- the string ID found in the `entity_id` key of the dashboard object when using the API directly or using the SDK Collection Browser to return data |
| initialParameters\*\*        | `Record<string, string \| string[]>`                        | Query parameters for the dashboard. For a single option, use a `string` value, and use a list of strings for multiple options.                                                                                                                                                                                                   |
| withTitle                    | `boolean`                                                   | Whether the dashboard should display a title.                                                                                                                                                                                                                                                                                    |
| withCardTitle                | `boolean`                                                   | Whether the dashboard cards should display a title.                                                                                                                                                                                                                                                                              |
| withDownloads                | `boolean \| null`                                           | Whether to hide the download button.                                                                                                                                                                                                                                                                                             |
| hiddenParameters\*\*         | `string[] \| null`                                          | A list of [parameters to hide](../../embedding/public-links.md#appearance-parameters).                                                                                                                                                                                                                                           |
| drillThroughQuestionHeight\* | `number \| null`                                            | Height of a question component when drilled from the dashboard to a question level.                                                                                                                                                                                                                                              |
| questionPlugins\*            | `{ mapQuestionClickActions: Function } \| null`             | Additional mapper function to override or add drill-down menu. See the implementing custom actions section for more details.                                                                                                                                                                                                     |
| onLoad                       | `(dashboard: Dashboard \| null) => void`                    | Event handler that triggers after dashboard loads with all visible cards and their content.                                                                                                                                                                                                                                      |
| onLoadWithoutCards           | `(dashboard: Dashboard \| null) => void`                    | Event handler that triggers after dashboard loads, but without its cards - at this stage dashboard title, tabs and cards grid is rendered, but cards content is not yet loaded.                                                                                                                                                  |
| renderDrillThroughQuestion\* | `() => ReactNode`                                           | A react component that renders [a question's layout](#customizing-drill-through-question-layout) shown after drilling through a question or clicking on a question card in the dashboard.                                                                                                                                        |
| drillThroughQuestionProps\*              | `[InteractiveQuestionProps](./questions.md#question-props)` | Props for the drill-through question                                                                                                                                                                                                                                                                                             |

_\* Not available for `StaticDashboard`._

_\*\* Combining `initialParameters` and `hiddenParameters` to filter data on the frontend is a [security risk](./authentication.md#security-warning-each-end-user-must-have-their-own-metabase-account). Combining `initialParameters` and `hiddenParameters` to declutter the user interface is fine._

By default, dashboard components take full page height (100vh). You can override this with custom styles passed via `style` or `className` props.

```tsx
{% include_file "{{ dirname }}/snippets/dashboards/custom-height.tsx" snippet="example" %}
```

## Example embedded dashboard with `InteractiveDashboard` component

```typescript
{% include_file "{{ dirname }}/snippets/dashboards/interactive-dashboard.tsx" %}
```

## Customizing drill-through question layout

When drilling through or clicking on a question card in the dashboard, you will be taken to the question view. By default, the question is shown in the [default layout](./questions.md#customizing-interactive-questions) for interactive questions.

To customize the question layout, pass a `renderDrillThroughQuestion` prop to the `InteractiveDashboard` component, with the custom view as the child component.

```typescript
{% include_file "{{ dirname }}/snippets/dashboards/custom-drill-through-question-layout.tsx" snippet="example-1" %}

{% include_file "{{ dirname }}/snippets/dashboards/custom-drill-through-question-layout.tsx" snippet="example-2" %}
```

The questionView prop accepts a React component that will be rendered in the question view, which you can build with namespaced components within the `InteractiveQuestion` component. See [customizing interactive questions](./questions.md#customizing-interactive-questions) for an example layout.

## Dashboard plugins

### `dashboardCardMenu`

This plugin allows you to add, remove, and modify the custom actions on the overflow menu of dashboard cards. The plugin appears as a dropdown menu on the top right corner of the card.

The plugin's default configuration looks like this:

```typescript
{% include_file "{{ dirname }}/snippets/dashboards/plugins.tsx" snippet="example-base-1" %}
```

`dashboardCardMenu`: can be used in the InteractiveDashboard like this:

```typescript
{% include_file "{{ dirname }}/snippets/dashboards/plugins.tsx" snippet="example-base-2" %}
```

#### Enabling/disabling default actions

To remove the download button from the dashcard menu, set `withDownloads` to `false`. To remove the edit link from the dashcard menu, set `withEditLink` to `false`.

```typescript
{% include_file "{{ dirname }}/snippets/dashboards/plugins.tsx" snippet="example-default-actions" %}
```

#### Adding custom actions to the existing menu:

You can add custom actions to the dashcard menu by adding an object to the `customItems` array. Each element can either be an object or a function that takes in the dashcard's question, and outputs a list of custom items in the form of:

```typescript
{% include_file "{{ dirname }}/snippets/dashboards/plugins.tsx" snippet="example-custom-action-type" %}
```

Here's an example:

```typescript
{% include_file "{{ dirname }}/snippets/dashboards/plugins.tsx" snippet="example-custom-actions" %}
```

#### Replacing the existing menu with your own component

If you want to replace the existing menu with your own component, you can do so by providing a function that returns a React component. This function also can receive the question as an argument.

```typescript
{% include_file "{{ dirname }}/snippets/dashboards/plugins.tsx" snippet="example-custom-actions-menu" %}
```

## Creating dashboards

Creating a dashboard could be done with `useCreateDashboardApi` hook or `CreateDashboardModal` component.

### Hook

```typescript
{% include_file "{{ dirname }}/snippets/dashboards/create-dashboard.tsx" snippet="example-hook" %}
```

Props:

| Prop         | Type                             | Description                                                                                                    |
| ------------ | -------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| name         | `string`                         | (required) Dashboard title                                                                                     |
| description  | `string \| null`                 | Optional dashboard description                                                                                 |
| collectionId | `number \| 'root' \| 'personal'` | Collection in which to create a new dashboard. You can use predefined system values like `root` or `personal`. |

### Component

```typescript
{% include_file "{{ dirname }}/snippets/dashboards/create-dashboard.tsx" snippet="example-component" %}
```

Supported component props:

| Prop          | Type                             | Description                                                                                                        |
| ------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| collectionId? | `number \| 'root' \| 'personal'` | Initial collection in which to create a dashboard. You can use predefined system values like `root` or `personal`. |
| onCreate      | `(dashboard: Dashboard) => void` | Handler to react on dashboard creation.                                                                            |
| onClose       | `() => void`                     | Handler to close modal component                                                                                   |
