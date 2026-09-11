---
title: Embedding parameters reference
summary: "Reference for parameters in modular embeds: which attribute or prop to use for each task, how web components parse parameter attributes, the value formats each filter type accepts, the change callback's source values, and the rules for params in a signed token."
---

# Embedding parameters reference

Reference material for parameters in embedded dashboards and charts. For how to use all this, check out [Embedding parameters](./parameters.md).

For each attribute's or prop's type and description, see:

- [Dashboard component reference](./dashboard-reference.md)
- [Question component reference](./question-reference.md)

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

## Web component attribute parsing

The parameter attributes take JSON: an object keyed by slug, or for `hidden-parameters`, an array of slugs.

Attribute values are parsed as [JSON5](https://json5.org/), so single quotes, unquoted keys, and trailing commas all work. Only values that start with `{` or `[` are parsed as JSON, so wrap even a single slug in `hidden-parameters` in `[]`. A value that starts with `{` or `[`, but that doesn't parse, will stay as a string, and Metabase will log an error.

Changing `initial-parameters`, `initial-sql-parameters`, or `hidden-parameters` _after_ the embed has loaded re-renders the embed from scratch with the new values. Changing `parameters` or `sql-parameters` pushes the new values without a reload.

## Value formats by parameter type

These formats apply wherever you pass a value: web component attributes, SDK props, and the `params` object in a [signed token](#params-in-a-signed-token).

| Parameter type     | Accepts                                                                                                            | Examples                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| Text, category, ID | A string, or an array of strings for multi-select filters.                                                         | `"Gizmo"`, `["Gizmo", "Gadget"]`          |
| Number             | A number, a numeric string, or an array of either. Two-element arrays for between filters; `null` for an open end. | `50`, `"50"`, `[10, 20]`, `[10, null]`    |
| Boolean            | `true` or `false`, or the strings `"true"` and `"false"`.                                                          | `true`                                    |
| Date               | A string in one of the formats below.                                                                              | `"past30days"`, `"2024-01-01~2024-03-31"` |
| Time grouping      | A unit name.                                                                                                       | `"month"`, `"week"`, `"quarter"`          |

To clear a filter, pass `null` for its slug. To reset it to its default, leave the slug out.

The [change callback](#change-payload) hands values back as arrays: push `4` and you get `[4]`. Date and time grouping values are the exception and stay strings.

The two-element between formats work with dashboard filters connected to a column or a field filter. A plain SQL variable can only be connected to an equal-to filter, so a between value never reaches one; put the comparison in the SQL instead.

### Date formats

The quickest way to get these values is to set the filter in Metabase and copy it from the address bar.

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
| `lastday`, `lastweek`, `lastmonth`, `lastquarter`, `lastyear` | The previous unit.                                                                                                         |
| `past30days`, `past3months`, `past1years`                     | The last N units, not counting the current one. Units: `minutes`, `hours`, `days`, `weeks`, `months`, `quarters`, `years`. |
| `past30days~`                                                 | Same, but including the current unit.                                                                                      |
| `next7days`, `next7days~`                                     | The next N units, with or without the current one.                                                                         |
| `past30days-from-2years`                                      | The last 30 days, starting 2 years ago. Same for `next…-from-…`.                                                           |
| `exclude-hours-0-23`                                          | Exclude hours of the day, `0` through `23`. List each hour, separated by hyphens.                                          |
| `exclude-days-Mon-Sun`                                        | Exclude days of the week, using `Mon` through `Sun`.                                                                       |
| `exclude-months-Jan-Dec`                                      | Exclude months, using `Jan` through `Dec`.                                                                                 |
| `exclude-quarters-1-4`                                        | Exclude quarters, `1` through `4`.                                                                                         |

The `exclude-` formats work with dashboard filters and field filters. A plain SQL variable can't take them, because Metabase substitutes a variable with a date range, and an exclusion isn't one.

## Change payload

`onParametersChange` (SDK) and the `parameters-change` event (web component, as `event.detail`) both deliver the same object, a [`ParameterChangePayload`](./sdk/api/ParameterChangePayload.html). Every field is keyed by parameter slug and lists every parameter on the item, with `null` where there's no value.

| Field                | What it holds                                                                   |
| -------------------- | ------------------------------------------------------------------------------- |
| `parameters`         | The values currently applied to the embed.                                      |
| `defaultParameters`  | Each parameter's default value.                                                 |
| `lastUsedParameters` | The values this person last applied on this dashboard. Dashboards only.         |
| `source`             | Why the callback fired. See [When the callback fires](#when-the-callback-fires). |

SQL questions deliver a [`SqlParameterChangePayload`](./sdk/api/SqlParameterChangePayload.html) through `onSqlParametersChange` or `sql-parameters-change`. It's the same object without `lastUsedParameters`.

### When the callback fires

The [`source`](./sdk/api/ParameterChangeSource.html) field says which of these happened:

| `source`        | Fires when                                                                                                                                                                                   |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `initial-state` | The embed finishes loading. Once per load.                                                                                                                                                   |
| `manual-change` | Someone applies a value with one of Metabase's filter widgets. On a dashboard with auto-apply turned off, editing a widget doesn't count; clicking **Apply** does.                            |
| `auto-change`   | You pushed values and Metabase applied something different. The payload carries what was actually applied.                                                                                   |

Metabase normalizes values before applying them, so `auto-change` usually means one of two things:

- You pushed a bare value, and Metabase [stored it as an array](#value-formats-by-parameter-type). Pushing `[4]` fires nothing.
- You left a slug out. A push replaces every value, so each slug you didn't include resolves to its default, or `null` if it has none, and `auto-change` reports it.

## Params in a signed token

On guest embeds, your server passes parameter values in the `params` object of the JWT it signs. What Metabase does with them depends on the visibility you chose for each parameter in the embed wizard.

| Wizard setting | Token sets it                                               | Page sets it (`initial-parameters`, widget, or URL)                                                          | Widget shows |
| -------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------ |
| **Disabled**   | Rejected: `You're not allowed to specify a value for slug.` | Rejected, same error.                                                                                        | No           |
| **Editable**   | Allowed. The widget disappears for that token.              | Allowed, unless the token also sets it: `You can't specify a value for slug if it's already set in the JWT.` | Yes          |
| **Locked**     | Required: `You must specify a value for :slug in the JWT.`  | Rejected: `You can only specify a value for slug in the JWT.`                                                | No           |

Other rules:

- Always include `params` (even just as `{}`). A token without params is rejected with `Token is missing value for keypath [:params]`.
- A slug that isn't on the item at all is rejected with `Unknown parameter :slug.`
- Pass values as arrays, one element per value: `{ category: ["Gadget", "Gizmo"] }`. A bare value like `{ category: "Gadget" }` works too, but arrays behave consistently everywhere, including in the dropdown values of editable widgets.
- For a locked filter connected to a plain variable in a SQL question, Metabase substitutes the values as a comma-separated list. That works inside `{% raw %} IN ({{variable}}) {% endraw %}`, but after `=` it's a SQL error from your database, not a Metabase error. So, unless the query is written for a list, pass one element. To deal with several values, connect the filter to a [field filter](../questions/native-editor/field-filters.md) instead, which expands to `IN (...)` on its own, and wrap the tag in `[[ ]]` so `[]` turns the clause off.
- An empty array, `[]`, means "no value" and turns the filter off for that token.
- A blank string, `""`, counts as no value at all. On a locked parameter that's the same as leaving it out, so the token is rejected.
- Metabase substitutes token values into text cards on the server, so a [text card variable that's connected to the filter](../dashboards/filters.md#wiring-up-dashboard-filters-to-text-cards) shows the value even though the browser never receives it.

For a walkthrough, check out [Restrict data on guest embeds](./parameters.md#restrict-data-on-guest-embeds). For how to sign and refresh the token, check out [Guest embeds](./guest-embedding.md).

## Further reading

- [Embedding parameters](./parameters.md)
- [Dashboard component reference](./dashboard-reference.md)
- [Question component reference](./question-reference.md)
- [Guest embeds](./guest-embedding.md)
- [Modular embedding components](./components.md)
