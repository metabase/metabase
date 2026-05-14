---
title: Modular embedding parameters
summary: Pass parameter values to embedded dashboards and SQL questions in modular embedding (React SDK and web components).
---

# Modular embedding parameters

This page covers how to pass parameter values to embedded dashboards and SQL questions.

## Modular embedding SDK (React)

### Pass parameter values to a dashboard

You can set initial values for embeds (uncontrolled), and optionally keep your app in sync with values as people change them (controlled). You can pick either `initialParameters` and `parameters`, but don't combine them.

#### `initialParameters` (uncontrolled)

Set the filter values once on load. Your app won't know when people change filters in the dashboard. Pick this when you don't need to track those changes.

```typescript
{% include_file "{{ dirname }}/snippets/parameters/dashboards/initial-parameters.tsx" snippet="example" %}
```

See [How parameter values are resolved](#how-parameter-values-are-resolved) for null / missing-slug semantics.

#### `parameters` + `onParametersChange` (controlled)

Push values from your app, and observe every applied change via `onParametersChange`. This works like a controlled `<input value onChange>`. Your app holds the source of truth, the dashboard re-renders when the prop changes, and you receive a callback whenever applied values change.

```typescript
{% include_file "{{ dirname }}/snippets/parameters/dashboards/controlled-parameters.tsx" snippet="example-controlled" %}
```

`onParametersChange` receives the [dashboard parameter change payload](#dashboard-parameter-change-payload).


> Don't combine `initialParameters` and `parameters` - pick one. For controlled behavior, only use `parameters`.

### Pass parameters to SQL questions

You can pass [parameter](../questions/native-editor/sql-parameters.md) values to SQL questions in the format `{parameter_name: parameter_value}`. You can set initial values for embeds (uncontrolled), and optionally keep your app in sync with values as people change them (controlled).

These props only work with SQL questions, not query-builder questions.

#### `initialSqlParameters` (uncontrolled)

Set the parameter values once on load. Your app won't know when people change parameters in the question. Pick this when you don't need to track those changes.

```typescript
{% include_file "{{ dirname }}/snippets/parameters/questions/initial-sql-parameters.tsx" snippet="example" %}
```

See [How parameter values are resolved](#how-parameter-values-are-resolved) for null / missing-slug semantics.

#### `sqlParameters` + `onSqlParametersChange` (controlled)

Push values from your app, and observe every applied change via `onSqlParametersChange`. This works like a controlled `<input value onChange>` - your app holds the source of truth, the question re-renders when the prop changes, and you receive a callback whenever applied values change.

```typescript
{% include_file "{{ dirname }}/snippets/parameters/questions/controlled-sql-parameters.tsx" snippet="example-controlled" %}
```

`onSqlParametersChange` receives the [SQL question parameter change payload](#sql-question-parameter-change-payload).

## Modular embedding (web components)

### Pass parameter values to embedded components

You can set dashboard filters and SQL parameters from your page, push new values at runtime, and listen for applied changes.

#### Seed values once with `initial-parameters` / `initial-sql-parameters`

Set values on mount via attributes. The component reads them once on load and ignores any subsequent changes to the attribute. User widget edits are not reflected back to your page.

```html
<metabase-dashboard
  dashboard-id="1"
  initial-parameters='{"state": "NY"}'
></metabase-dashboard>

<metabase-question
  question-id="42"
  initial-sql-parameters='{"product_id": 50}'
></metabase-question>
```

Attributes carry JSON. Pass an object whose keys are parameter slugs (dashboards) or SQL variable names (questions). See [How parameter values are resolved](#how-parameter-values-are-resolved) for null / missing-slug semantics.

#### Push values at runtime with `parameters` / `sqlParameters`

For controlled behavior, set the JS property on the element instead of the attribute. The component re-renders to apply the new values.

```html
<metabase-dashboard id="my-dashboard" dashboard-id="1"></metabase-dashboard>

<script>
  const el = document.getElementById("my-dashboard");
  el.parameters = { state: "NY" };
</script>
```

The same pattern works for `metabase-question` via the `sqlParameters` property.

To switch a component back to uncontrolled mode (leaving the last applied values in place), set the property to `undefined`.

#### Clearing parameters

To clear a single parameter, set its value to `null`. This strictly clears the parameter and ignores its default value.

```html
<script>
  const el = document.getElementById("my-dashboard");
  // `null` strictly clears the parameter (ignores its default).
  el.parameters = { ...el.parameters, state: null };
</script>
```

To clear every parameter, assign an empty object `{}`.

```html
<script>
  const el = document.getElementById("my-dashboard");
  el.parameters = {};
</script>
```

#### Observe applied changes with `parameters-change` / `sql-parameters-change`

Listen for events to keep your page in sync with what's actually applied:

```html
<metabase-dashboard id="my-dashboard" dashboard-id="1"></metabase-dashboard>

<script>
  const el = document.getElementById("my-dashboard");

  el.addEventListener("parameters-change", (event) => {
    const { source, parameters, defaultParameters, lastUsedParameters } =
      event.detail;
    console.log(source, parameters);
  });
</script>
```

The `event.detail` carries the [dashboard parameter change payload](#dashboard-parameter-change-payload).

For SQL questions, listen for `sql-parameters-change` on `<metabase-question>`. Its `event.detail` carries the [SQL question parameter change payload](#sql-question-parameter-change-payload).

## How parameter values are resolved

These rules apply to all four props — `initialParameters` / `parameters` (dashboards) and `initialSqlParameters` / `sqlParameters` (SQL questions) — and to the matching web component attributes (`initial-parameters`, `parameters`, etc.). For each parameter slug:

- **Set a value**: Pass a `string` for a single-option filter, and an array of `string`s for multi-option filters.
- **Clear a value:** Set to `null`: the parameter is cleared and its default is not used.
- **Reset to the default value**: Omit a value (or set to `undefined`) and the embed will fall back to the parameter's default (or `null` if it has no default).

## Dashboard parameter change payload

Delivered to `onParametersChange` (SDK) and as `event.detail` for the `parameters-change` event (web components).

{% include_file "{{ dirname }}/sdk/api/snippets/ParameterChangePayload.md" snippet="properties" %}

`source` indicates why the callback fired:

{% include_file "{{ dirname }}/sdk/api/snippets/ParameterChangeSource.md" %}

## SQL question parameter change payload

Delivered to `onSqlParametersChange` (SDK) and as `event.detail` for the `sql-parameters-change` event (web components).

{% include_file "{{ dirname }}/sdk/api/snippets/SqlParameterChangePayload.md" snippet="properties" %}

`source` indicates why the callback fired:

{% include_file "{{ dirname }}/sdk/api/snippets/SqlParameterChangeSource.md" %}
