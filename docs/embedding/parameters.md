---
title: Modular embedding parameters
summary: Pass parameter values to embedded dashboards and SQL questions in modular embedding (React SDK and web components).
---

# Modular embedding parameters

This page covers how to pass parameter values to embedded dashboards and SQL questions in [modular embedding](./modular-embedding.md), for both the [Modular embedding SDK](./sdk/introduction.md) (React) and the web components.

## Modular embedding SDK (React)

### Pass parameter values to a dashboard

You can pre-populate dashboard filters from your app, and (optionally) keep your app in sync with what's currently applied. Use one of these props depending on whether you only want to seed initial values or stay in sync over time.

#### `initialParameters` (uncontrolled)

Pre-populate filters once on load. After the dashboard mounts, user widget edits are not reflected back to your app. Pick this when you don't need to react to filter changes.

```typescript
{% include_file "{{ dirname }}/snippets/parameters/dashboards/initial-parameters.tsx" snippet="example" %}
```

For each parameter:

- set to a value (a `string` for a single option, an array of `string`s for multiple): that value is applied.
- set to `null`: strictly cleared, ignoring the parameter's default.
- omitted (or set to `undefined`): falls back to the parameter's default (or `null` if it has no default).

Examples:

- Passing an empty object `{}` resets every parameter to its default.
- Passing an object with every slug set to `null` clears all parameter values.

#### `parameters` + `onParametersChange` (controlled)

Push values from your app, and observe every applied change via `onParametersChange`. This works like a controlled `<input value onChange>` - your app holds the source of truth, the dashboard re-renders when the prop changes, and you receive a callback whenever applied values change.

```typescript
{% include_file "{{ dirname }}/snippets/parameters/dashboards/controlled-parameters.tsx" snippet="example-controlled" %}
```

`onParametersChange` receives the [dashboard parameter change payload](#dashboard-parameter-change-payload).

##### Clearing a single parameter

Set its value to `null`. This strictly clears the parameter and ignores its default value. Missing slugs fall back to `parameter.default ?? null`.

```typescript
{% include_file "{{ dirname }}/snippets/parameters/dashboards/controlled-parameters.tsx" snippet="example-clear-one" %}
```

##### Clearing all parameters

Pass an empty object.

```typescript
{% include_file "{{ dirname }}/snippets/parameters/dashboards/controlled-parameters.tsx" snippet="example-clear-all" %}
```

To switch back to uncontrolled mode (and leave the dashboard's last applied values in place), set the `parameters` prop to `undefined`.

> Don't combine `initialParameters` and `parameters` - pick one. For controlled behavior, only use `parameters`.

### Pass parameters to SQL questions

You can pass [parameter](../questions/native-editor/sql-parameters.md) values to SQL questions like so:
```
{parameter_name: parameter_value}

```

There are two ways to pass parameters:

- Uncontrolled, where the component owns the state: use `initialSqlParameters` to set initial values.
- Controlled, where your app owns the parameter state. Use `sqlParameters` and `onSqlParametersChange` to sync the parameter values with your app when people viewing the embed change the filters.

These props can only be used with SQL questions; they don't work for query-builder questions.

Don't combine `initialSqlParameters` and `sqlParameters` - pick one. For controlled behavior, only use `sqlParameters`.

#### Uncontrolled component with `initialSqlParameters`

Sets the parameter value once on load. After the question mounts, if the person viewing the embed changes the value, your app won't know about it.

```typescript
{% include_file "{{ dirname }}/snippets/parameters/questions/initial-sql-parameters.tsx" snippet="example" %}
```

For each parameter:

- set to a value: that value is applied.
- set to `null`: strictly cleared, ignoring the parameter's default.
- omitted (or set to `undefined`): falls back to the parameter's default (or `null` if it has no default).

Examples:

- Passing an empty object `{}` resets every parameter to its default.
- Passing an object with every slug set to `null` clears all parameter values.

#### Controlled component with `sqlParameters` and `onSqlParametersChange`

With this setup, your app maintains the parameter value state. When someone viewing the embed updates the value, a callback fires to update your app with the new value, and the question re-renders with this new value.  This works like a controlled `<input value onChange>`.

```typescript
{% include_file "{{ dirname }}/snippets/parameters/questions/controlled-sql-parameters.tsx" snippet="example-controlled" %}
```

`onSqlParametersChange` receives the [SQL question parameter change payload](#sql-question-parameter-change-payload).

##### Clearing a parameter

To clear a parameter completely, set its value to `null`. Clearing the parameter with a `null` also ignores the parameter's default value (if any). Missing parameter fall back to `parameter.default ?? null`.

```typescript
{% include_file "{{ dirname }}/snippets/parameters/questions/controlled-sql-parameters.tsx" snippet="example-clear" %}
```

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

Attributes carry JSON. Pass an object whose keys are parameter slugs (dashboards) or SQL variable names (questions). Setting a value to `null` strictly clears that parameter (ignoring its default); slugs omitted from the object fall back to the parameter's default.

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
