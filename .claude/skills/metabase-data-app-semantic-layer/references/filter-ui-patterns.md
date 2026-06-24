# Filter UI Checklist

Use these patterns when building custom filter bars for data apps.

## Filter Contract

Before writing controls, map each filter to the dashboard. Keep this contract small and concrete:

| Filter | Runtime options query | Raw value | Applies to | Unsupported sections |
| ------ | --------------------- | --------- | ---------- | -------------------- |
| Franchise | breakout on franchise id/name | franchise id | orders, revenue, inventory | none |
| Plan | breakout on plan | plan text | orders | revenue, inventory |

If a filter has unsupported sections, either make it section-scoped or do not render it as a global dashboard filter.

For every rendered card or table, build filters from that semantic object's own generated fields or metric dimensions. Do not reuse a filter array built for a different table or metric.

Before rendering a filter, answer:

- What query provides runtime options?
- What raw value is stored?
- Which cards can accept that value?
- Which cards cannot?
- Does `All` produce no filter?

## Runtime Categorical Options

Query options from Metabase at runtime with a breakout on the same field or metric dimension used by the filter.

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

## Searchable Runtime Filters

Use an existing app/component-library combobox if one exists. If the repo has no component library, keep the picker minimal; do not build a complex popover, keyboard model, or virtualized list unless the app needs it.

Minimum behavior:

- Search filters labels, not raw ids.
- The `All` option is always available.
- Selecting an option stores the raw `value`.
- The list is capped or scrollable so it cannot stretch the page.

Style this to match the app. If accessibility, keyboard behavior, or popover positioning becomes non-trivial, prefer a small established combobox component or the app's component library instead of hand-rolling more behavior.
