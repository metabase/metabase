---
title: "Modular embedding SDK - dashboards"
summary: Embed static or interactive Metabase dashboards using the Modular embedding SDK. Customize dashboard layout, drill-through, and add custom actions.
---

# Modular embedding SDK - dashboards

{% include plans-blockquote.html feature="Modular embedding SDK" sdk=true %}

You can embed an interactive, editable, or static dashboard.

**Keep in mind that embedding multiple instances of dashboards on the same page is not yet supported.**

## Embedding a dashboard

You can embed a dashboard using one of the dashboard components:

### `StaticDashboard`

A lightweight dashboard component. Use this component when you want to display results without letting people interact with the data.

#### API Reference

- [Component](./api/StaticDashboard.html)
- [Props](./api/StaticDashboardProps.html)

#### Props

{% include_file "{{ dirname }}/api/snippets/StaticDashboardProps.md" snippet="properties" %}

### `InteractiveDashboard`

A dashboard component with drill downs, click behaviors, and the ability to view and click into questions. Use this component when you want to allow people to explore their data.

#### API Reference

- [Component](./api/InteractiveDashboard.html)
- [Props](./api/InteractiveDashboardProps.html)

#### Props

{% include_file "{{ dirname }}/api/snippets/InteractiveDashboardProps.md" snippet="properties" %}

### `EditableDashboard`

A dashboard component with the features available in the `InteractiveDashboard` component, as well as the ability to add and update questions, layout, and content within your dashboard. Use this component when you want to give people the ability to modify your dashboards, for example in an admin panel in your app.

#### API Reference

- [Component](./api/EditableDashboard.html)
- [Props](./api/EditableDashboardProps.html)

#### Props

{% include_file "{{ dirname }}/api/snippets/EditableDashboardProps.md" snippet="properties" %}

## Example embedded dashboard with `InteractiveDashboard` component

```typescript
{% include_file "{{ dirname }}/snippets/dashboards/interactive-dashboard.tsx" %}
```

## Pass parameter values to a dashboard

You can pre-populate dashboard filters from your app, and (optionally) keep your app in sync with what's currently applied. Use one of these props depending on whether you only want to seed initial values or stay in sync over time.

### `initialParameters` (uncontrolled)

Pre-populate filters once on load. After the dashboard mounts, user widget edits are not reflected back to your app. Pick this when you don't need to react to filter changes.

```typescript
{% include_file "{{ dirname }}/snippets/dashboards/initial-parameters.tsx" snippet="example" %}
```

For a single value, pass a `string`. For multiple values, pass an array of `string` values.

### `parameters` + `onParametersChange` (controlled)

Push values from your app, and observe every applied change via `onParametersChange`. This works like a controlled `<input value onChange>` - your app holds the source of truth, the dashboard re-renders when the prop changes, and you receive a callback whenever applied values change.

```typescript
{% include_file "{{ dirname }}/snippets/dashboards/controlled-parameters.tsx" snippet="example-controlled" %}
```

The callback receives a payload with these fields:

- `source` - why the callback fired:
  - `"initial-state"` - the post-load snapshot, fired once per dashboard load.
  - `"manual-change"` - a user edited a filter widget.
  - `"auto-change"` - values you pushed via `parameters` were stored differently than you sent (for example, a scalar wrapped into an array, an unknown slug ignored, an explicit `null` applied as a clear). Use the payload to re-sync your local state.
- `parameters` - the currently applied values, slug-keyed.
- `defaultParameters` - the dashboard's default values, slug-keyed.
- `lastUsedParameters` - the values this user last applied to this dashboard, slug-keyed. Empty if the user hasn't applied any parameters yet.

If your push is applied unchanged, no callback fires.

#### Clearing a single parameter

Set its value to `null`. This strictly clears the parameter and ignores its default value. Missing slugs fall back to `parameter.default ?? null`.

```typescript
{% include_file "{{ dirname }}/snippets/dashboards/controlled-parameters.tsx" snippet="example-clear-one" %}
```

#### Clearing all parameters

Pass an empty object.

```typescript
{% include_file "{{ dirname }}/snippets/dashboards/controlled-parameters.tsx" snippet="example-clear-all" %}
```

To switch back to uncontrolled mode (and leave the dashboard's last applied values in place), set the `parameters` prop to `undefined`.

> Don't combine `initialParameters` and `parameters` - pick one. For controlled behavior, only use `parameters`.

## Customizing dashboard height

By default, dashboard components take full page height (100vh). You can override this with custom styles passed via `style` or `className` props.

```tsx
{% include_file "{{ dirname }}/snippets/dashboards/custom-height.tsx" snippet="example" %}
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

### `mapQuestionClickActions`

You can customize what happens when people click on a data point on a dashboard with the `mapQuestionClickActions` plugin. See [mapQuestionClickActions](./questions.md#mapquestionclickactions).

## Creating dashboards

Creating a dashboard could be done with `useCreateDashboardApi` hook or `CreateDashboardModal` component.

### `useCreateDashboardApi`

Use this hook if you'd like to have total control over the UI and settings.

Until the SDK is fully loaded and initialized, the hook returns `null`.

#### API Reference

- [Hook](./api/useCreateDashboardApi.html)
- [Options](./api/CreateDashboardValues.html)

#### Example

```typescript
{% include_file "{{ dirname }}/snippets/dashboards/create-dashboard.tsx" snippet="example-hook" %}
```

#### Options

{% include_file "{{ dirname }}/api/snippets/CreateDashboardValues.md" snippet="properties" %}

### `CreateDashboardModal`

#### API Reference

- [Component](./api/CreateDashboardModal.html)
- [Props](./api/CreateDashboardModalProps.html)

#### Example

```typescript
{% include_file "{{ dirname }}/snippets/dashboards/create-dashboard.tsx" snippet="example-component" %}
```

#### Props

{% include_file "{{ dirname }}/api/snippets/CreateDashboardModalProps.md" snippet="properties" %}
