# Filter UI Checklist

Use these patterns when building custom filter bars for data apps.

## Filter Contract

Before writing controls, map each filter to the dashboard. Keep this contract small and concrete:

| Filter | Runtime options query | Raw value | Applies to | Unsupported sections |
| ------ | --------------------- | --------- | ---------- | -------------------- |
| Franchise | breakout on franchise id/name | franchise id | orders, revenue, inventory | none |
| Plan | breakout on plan | plan text | orders | revenue, inventory |

If a filter has unsupported sections, either make it section-scoped or do not render it as a global dashboard filter. Do not show duplicate date controls for the same page unless both visibly affect different labeled sections.

For every rendered card or table, build filters from that semantic object's own generated fields or metric dimensions. Do not reuse a filter array built for a different table or metric.

Before rendering a filter, answer:

- What query provides runtime options?
- What raw value is stored?
- Which cards can accept that value?
- Which cards cannot?
- Does `All` produce no filter?

## Runtime Categorical Options

Query options from Metabase at runtime with a breakout on the same field or metric dimension used by the filter.

- Run a `useMetabaseQuery` breakout on the same table field or metric dimension used by `filter(...)`, then derive a deduped option list from returned rows.
- Prefer querying options from the same semantic object used by the charts so the option list stays compatible with the filter.
- Treat categorical labels as runtime values unless the user explicitly provides a closed enum. Field names in the generated schema are not value lists.
- Use a searchable picker/combobox for entity filters and long runtime option lists.

For entity filters, keep display labels and raw values separate:

```ts
type Option = { label: string; value: string };

const franchiseOptions = rows.map((row) => ({
  label: row.franchise_name ?? row.franchise_id,
  value: row.franchise_id,
}));
```

Use the raw `value` in `filter(...)`. Never filter by display labels when a stable id is available.

Do not render a free-text input that writes directly to an exact id filter. If the filter is searchable, search option labels and store the selected raw value.

## Reset Missing Runtime Values

Runtime option sets can change. If the selected value disappears, reset to `all` so the app does not stay filtered to no rows.

```tsx
useEffect(() => {
  if (
    selectedValue !== "all" &&
    !options.some((option) => option.value === selectedValue)
  ) {
    setSelectedValue("all");
  }
}, [options, selectedValue]);
```

Keep the `All` option selectable even while options are loading, empty, or errored.

## Filter State Rules

- Default every filter to `all` or empty, and run the unfiltered query.
- Convert `all`, `""`, `null`, and `undefined` to `[]`.
- Keep `All` options selectable even while runtime option queries are loading, empty, or errored.
- Do not disable the whole control while loading options; keep `All` enabled and show a loading/empty option for dynamic values.
- If a selected runtime option disappears from the latest option query, reset that filter to `all` so stale values do not keep filtering the dashboard to no rows.
- For custom date ranges, apply the filter only when both dates are valid.
- Never fill half-selected ranges with sentinel dates like `2000-01-01` or `2100-01-01`.
- Keep one filter array per queried semantic object when charts use different date fields or metric dimensions.
- Memoize filter arrays so SDK query keys stay stable.
- For boolean Yes/No/All filters, map both `true` and `false` explicitly; only All maps to no filter.

## Searchable Runtime Filters

Entity filters are filters where the selected value is an id/key but users need a label. They always use one searchable combobox, never a native `<select>` or a search input paired with `<select>`. Plain `<select>` is only for short closed enums explicitly provided by the user.

If no component exists:

- Prefer a small established combobox/listbox dependency for keyboard/focus behavior.
- Hand-roll only a small picker: input, capped list, mouse selection, Escape/blur close, and clear button.

Minimum behavior:

- Click or focus opens the option list immediately, even before the user types.
- Search filters labels, not raw ids.
- The `All` option is always available.
- Selecting an option stores the raw `value`.
- The list is capped or scrollable so it cannot stretch the page.

Do not close the list from an `onBlur` handler on the trigger button when the
popover contains an auto-focused input. Moving focus from the button to the
input blurs the button and immediately closes the list. If hand-rolling a
combobox, keep focus inside one wrapper and close only when focus leaves the
whole wrapper, or close from explicit selection, Escape, and outside clicks.

Style this to match the app. If accessibility, keyboard behavior, or popover positioning becomes non-trivial, prefer a small established combobox component or the app's component library instead of hand-rolling more behavior.

## Date Range Filters

Date ranges should use ISO `YYYY-MM-DD` strings for query values. Never use `type="date"`.

For custom date pickers:

- Include a Custom range option in date preset bars by default. Omit it only when the user explicitly asks for fixed presets only or no date range control. Order presets as durations first, then All time, then Custom last.
- First check whether the repo already has a date picker component or component library. If it does, use the existing component.
- If the repo has no existing date picker, install `react-datepicker`. The default data-app template only includes React, React DOM, and the Metabase SDK.
- Do not install a large UI suite just for one data-app date filter.
- Import `react-datepicker/dist/react-datepicker.css`, then add small CSS overrides for the app's visual style if needed.
- Type strict `react-datepicker` callbacks explicitly, for example `onChange={(date: Date | null) => ...}` for single-date pickers.
- For custom date ranges, use `selectsRange` with local `Date | null` start/end state, but only commit the query range when both dates are selected.
- If the custom range control should look like the other preset buttons, use `customInput` with a `forwardRef` button, spread react-datepicker's injected props, and call its injected `onClick` so the popover still opens.
- Convert selected dates to ISO `YYYY-MM-DD` strings with local date getters (`getFullYear`, `getMonth`, `getDate`) rather than `toISOString()`.
- For date-picker `selected` props, parse saved strings defensively and pass `null` for empty or invalid values. Never pass `new Date("")`.
- Recent `react-datepicker` packages include their own TypeScript types; do not add `@types/react-datepicker` unless the installed version actually needs it.

Install `react-datepicker` only when the repo does not already have a date picker:

```bash
npm install react-datepicker
```
