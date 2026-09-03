---
title: Embedding parameters reference
summary: "Reference for parameter attributes, props, events, and payloads in modular embeds, how values resolve, the value formats each filter type accepts, and the rules for params in a signed token."
---

# Embedding parameters reference

Reference material for parameters in embedded dashboards and charts. For how to use all this, check out [Embedding parameters](./parameters.md).

## Which props to use

| What you want       | On           | Web component                 | React SDK               |
| ------------------- | ------------ | ----------------------------- | ----------------------- |
| Starting values     | Dashboard    | `initial-parameters`          | `initialParameters`     |
|                     | SQL question | `initial-sql-parameters`      | `initialSqlParameters`  |
| Controlled values   | Dashboard    | `parameters`                  | `parameters`            |
|                     | SQL question | `sql-parameters`              | `sqlParameters`         |
| Change notification | Dashboard    | `parameters-change` event     | `onParametersChange`    |
|                     | SQL question | `sql-parameters-change` event | `onSqlParametersChange` |
| Hide widgets        | Both         | `hidden-parameters`           | `hiddenParameters`      |

Pass starting values or controlled values, not both. If you pass both, the embed uses the controlled values and logs a warning to the console (the iframe's console, for web components).

Query builder questions have no parameters. To filter one, put it on a dashboard and connect a filter to the card.

## Web component attributes, properties, and events

### Attributes

The generated tables in the [dashboard component reference](./dashboard-reference.md#web-component-metabase-dashboard-attributes) and the [question component reference](./question-reference.md#web-component-metabase-question-attributes) list every attribute. The five parameter attributes all take a JSON object or array keyed by slug.

Attribute values are parsed as [JSON5](https://json5.org/), so single quotes, unquoted keys, and trailing commas all work. Only values that start with `{` or `[` are parsed as JSON, so wrap even a single slug in `hidden-parameters` in `[]`. A value that starts with `{` or `[` but doesn't parse logs an error to the console and is kept as a plain string.

Changing `initial-parameters`, `initial-sql-parameters`, or `hidden-parameters` after the embed has loaded re-renders the embed from scratch with the new values. Changing `parameters` or `sql-parameters` pushes the new values without a reload.

### Properties

Two JS properties exist, and each one reads and writes an attribute:

| Property        | Element                | Backed by        |
| --------------- | ---------------------- | ---------------- |
| `parameters`    | `<metabase-dashboard>` | `parameters`     |
| `sqlParameters` | `<metabase-question>`  | `sql-parameters` |

Assigning an object serializes it into the attribute. Assigning `undefined` or `null` removes the attribute. Reading the property parses the attribute and returns the object, or `undefined` if the attribute is missing or invalid.

There's no `initialParameters`, `initialSqlParameters`, or `hiddenParameters` property. Assigning one does nothing; set the attribute instead.

### Events

| Event                   | Element                | `event.detail`                                              |
| ----------------------- | ---------------------- | ----------------------------------------------------------- |
| `parameters-change`     | `<metabase-dashboard>` | [Dashboard change payload](#dashboard-change-payload)       |
| `sql-parameters-change` | `<metabase-question>`  | [SQL question change payload](#sql-question-change-payload) |

Events are dispatched on the element and don't bubble, so attach the listener to the element itself.

## React SDK props

{% include plans-blockquote.html feature="Modular embedding SDK" sdk=true convert_pro_link_to_embedding=true %}

### Dashboard props

On `StaticDashboard`, `InteractiveDashboard`, and `EditableDashboard`:

- `initialParameters`: [`ParameterValues`](#parametervalues). Starting values, applied when the dashboard loads.
- `parameters`: [`ParameterValues`](#parametervalues). Controlled values. On every render, this object replaces the dashboard's parameter values.
- `onParametersChange`: `(payload: ParameterChangePayload) => void`. Fires on every applied change. Receives the [dashboard change payload](#dashboard-change-payload).
- `hiddenParameters`: `string[]`. Slugs whose widgets to hide.

Generated prop tables: [`StaticDashboard`](./dashboard-reference.md#react-sdk-staticdashboard-props), [`InteractiveDashboard`](./dashboard-reference.md#react-sdk-interactivedashboard-props), [`EditableDashboard`](./dashboard-reference.md#react-sdk-editabledashboard-props).

### Question props

On `StaticQuestion` and `InteractiveQuestion`, for SQL questions only:

- `initialSqlParameters`: [`SqlParameterValues`](#parametervalues). Starting values, applied when the question loads.
- `sqlParameters`: [`SqlParameterValues`](#parametervalues). Controlled values. On every render, this object replaces the question's parameter values.
- `onSqlParametersChange`: `(payload: SqlParameterChangePayload) => void`. Fires on every applied change. Receives the [SQL question change payload](#sql-question-change-payload).
- `hiddenParameters`: `string[]`. Slugs whose widgets to hide.

Generated prop tables: [`StaticQuestion`](./question-reference.md#react-sdk-staticquestion-props), [`InteractiveQuestion`](./question-reference.md#react-sdk-interactivequestion-props).

### `ParameterValues`

`ParameterValues` (dashboards) and `SqlParameterValues` (questions) are the same shape: an object keyed by slug.

{% include_file "{{ dirname }}/sdk/api/snippets/ParameterValues.md" %}

- [`ParameterValues`](./sdk/api/ParameterValues.html)
- [`SqlParameterValues`](./sdk/api/SqlParameterValues.html)

## How values resolve

These rules apply to every way of passing values: the starting and controlled props, the matching web component attributes, and the JS properties. For each slug in the object you pass:

| You pass                              | The embed applies                                                |
| ------------------------------------- | ---------------------------------------------------------------- |
| A value                               | That value.                                                      |
| `null`                                | Nothing. The parameter is cleared, and its default is ignored.   |
| Nothing (slug omitted or `undefined`) | The parameter's default, or nothing if it has no default.        |
| `{}` (empty object)                   | Every parameter reset to its default, or cleared if it has none. |

And for the object as a whole:

- On a dashboard, the values the viewer last used are applied only when you pass no values at all, and `{}` as a starting value counts as no values. Passing any value, even for one slug, means every other slug falls back to its default rather than to the last-used value.
- Setting the controlled prop or property to `undefined` hands control back to the embed, which keeps the last applied values.

Metabase normalizes values before applying them, and reports the normalized values back through the change callback with `source: "auto-change"`:

- A single value comes back as a one-element array, whether or not the filter is multi-select.
- An array passed to a single-select filter is cut down to a one-element array holding its first value.
- Numbers passed to a filter connected to a text column come back as strings. A plain SQL text variable keeps the number, so `42` comes back as `[42]`.

## Value formats by parameter type

| Parameter type     | Accepts                                                                                                            | Examples                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| Text, category, ID | A string, or an array of strings for multi-select filters.                                                         | `"Gizmo"`, `["Gizmo", "Gadget"]`          |
| Number             | A number, a numeric string, or an array of either. Two-element arrays for between filters; `null` for an open end. | `50`, `"50"`, `[10, 20]`, `[10, null]`    |
| Boolean            | `true` or `false`, or the strings `"true"` and `"false"`.                                                          | `true`                                    |
| Date               | A string in one of the formats below.                                                                              | `"past30days"`, `"2024-01-01~2024-03-31"` |
| Time grouping      | A unit name.                                                                                                       | `"month"`, `"week"`, `"quarter"`          |

### Date formats

| Format                                                        | Meaning                                                                                                                    |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `2024-01-02`                                                  | A single day. Add a time with `2024-01-02T10:20:00`.                                                                       |
| `2024-04`                                                     | A whole month.                                                                                                             |
| `Q2-2024`                                                     | A whole quarter.                                                                                                           |
| `2024-01-02~2024-05-10`                                       | A range, inclusive. Both ends can carry a time.                                                                            |
| `~2024-01-02`                                                 | Before that day.                                                                                                           |
| `2024-01-02~`                                                 | After that day.                                                                                                            |
| `today`, `yesterday`                                          | That day.                                                                                                                  |
| `thisday`, `thisweek`, `thismonth`, `thisquarter`, `thisyear` | The current unit.                                                                                                          |
| `past30days`, `past3months`, `past1years`                     | The last N units, not counting the current one. Units: `minutes`, `hours`, `days`, `weeks`, `months`, `quarters`, `years`. |
| `past30days~`                                                 | Same, but including the current unit.                                                                                      |
| `next7days`, `next7days~`                                     | The next N units, with or without the current one.                                                                         |
| `past30days-from-2years`                                      | The last 30 days, starting 2 years ago. Same for `next…-from-…`.                                                           |
| `exclude-hours-0-23`                                          | Exclude hours of the day, `0` through `23`. List each hour, separated by hyphens.                                          |
| `exclude-days-Mon-Sun`                                        | Exclude days of the week, using `Mon` through `Sun`.                                                                       |
| `exclude-months-Jan-Dec`                                      | Exclude months, using `Jan` through `Dec`.                                                                                 |
| `exclude-quarters-1-4`                                        | Exclude quarters, `1` through `4`.                                                                                         |

Most of these are the same strings Metabase writes into the URL when you set a date filter in the app, so the quickest way to get one is to set the filter in Metabase and copy it from the address bar.

## Change payload

### Dashboard change payload

Delivered to `onParametersChange` (SDK) and as `event.detail` of the `parameters-change` event (web component).

{% include_file "{{ dirname }}/sdk/api/snippets/ParameterChangePayload.md" snippet="properties" %}

- `parameters`: the values now applied, keyed by slug.
- `defaultParameters`: each parameter's default, keyed by slug.
- `lastUsedParameters`: the values the viewer last used on this dashboard, keyed by slug.
- `source`: why the callback fired. See [`source`](#source).

### SQL question change payload

Delivered to `onSqlParametersChange` (SDK) and as `event.detail` of the `sql-parameters-change` event (web component).

{% include_file "{{ dirname }}/sdk/api/snippets/SqlParameterChangePayload.md" snippet="properties" %}

Same as the dashboard payload, minus `lastUsedParameters`.

### `source`

| Value           | When                                                                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `initial-state` | The embed loaded and applied its starting values. Once per load.                                                                                       |
| `manual-change` | Someone applied a new value in one of Metabase's widgets. On dashboards, editing a widget without applying it doesn't fire.                            |
| `auto-change`   | Metabase normalized a value you pushed and is handing back the applied version. If the applied values are identical to what you pushed, nothing fires. |

## Params in a signed token

On guest embeds and static embeds, your server passes parameter values in the `params` object of the JWT it signs. What Metabase does with them depends on the visibility you chose for each parameter in the embed wizard.

| Wizard setting | Token sets it                                                | Page sets it (`initial-parameters`, widget, or URL)                                                           | Widget shows |
| -------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | ------------ |
| **Disabled**   | Rejected: `You're not allowed to specify a value for :slug.` | Rejected, same error.                                                                                         | No           |
| **Editable**   | Allowed. The widget disappears for that token.               | Allowed, unless the token also sets it: `You can't specify a value for :slug if it's already set in the JWT.` | Yes          |
| **Locked**     | Required: `You must specify a value for :slug in the JWT.`   | Rejected: `You can only specify a value for :slug in the JWT.`                                                | No           |

Other rules:

- Always include `params`, even as `{}`. A token without it is rejected before Metabase looks at any parameter.
- A slug that isn't on the item at all is rejected with `Unknown parameter :slug.`
- Pass values as arrays, one element per value: `{ category: ["Gadget", "Gizmo"] }`. A bare value like `{ category: "Gadget" }` works too, but arrays behave consistently everywhere, including in the dropdown values of editable widgets. Only one element works for a locked filter connected to a plain variable in a SQL question; more than one produces a SQL error from your database, not a Metabase error.
- An empty array, `[]`, means "no value" and turns the filter off for that token.
- A blank string, `""`, counts as no value at all. On a locked parameter that's the same as leaving it out, so the token is rejected.
- Metabase substitutes token values into text cards on the server, so a [text card variable that's connected to the filter](../dashboards/filters.md#wiring-up-dashboard-filters-to-text-cards) shows the value even though the browser never receives it.

For a walkthrough, check out [Restrict data with locked parameters](./parameters.md#restrict-data-with-locked-parameters). For how to sign and refresh the token, check out [Guest embeds](./guest-embedding.md).

## Further reading

- [Embedding parameters](./parameters.md)
- [Dashboard component reference](./dashboard-reference.md)
- [Question component reference](./question-reference.md)
- [Guest embeds](./guest-embedding.md)
- [Modular embedding components](./components.md)
