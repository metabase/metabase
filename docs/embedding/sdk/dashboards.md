---
title: "Modular embedding SDK - dashboards"
summary: Embed static or interactive Metabase dashboards using the Modular embedding SDK. Customize dashboard layout, drill-through, and add custom actions.
---

# Modular embedding SDK - dashboards

{% include plans-blockquote.html feature="Modular embedding SDK" sdk=true %}

You can embed an interactive, editable, or static dashboard.

**Keep in mind that embedding multiple instances of dashboards on the same page is not yet supported.**

## Embedding a dashboard

You can embed a dashboard using the one of the dashboard components:

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
