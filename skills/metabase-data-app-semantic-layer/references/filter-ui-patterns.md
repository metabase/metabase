# Filter UI Checklist

Use these patterns when building custom filter bars for data apps.

## Filter Contract

Before writing controls, map each filter to the dashboard. Keep this contract small and concrete:

| Filter    | Runtime options query         | Raw value    | Applies to                        | Unsupported sections |
| --------- | ----------------------------- | ------------ | --------------------------------- | -------------------- |
| Franchise | breakout on franchise id/name | franchise id | orders, revenue Metric, inventory | none                 |
| Plan      | breakout on plan              | plan text    | orders                            | revenue, inventory   |

If a filter has unsupported sections, either make it section-scoped or do not render it as a global dashboard filter. Do not show duplicate date controls for the same page unless both visibly affect different labeled sections.

For every rendered card or table, build filters from that query source's generated table fields or compatible Metric dimensions. Do not reuse a filter array built for a different table.

Before rendering a filter, answer:

- What query provides runtime options?
- What raw value is stored?
- Which cards can accept that value?
- Which cards cannot?
- Does `All` produce no filter?

## Runtime Categorical Options

Query options from Metabase at runtime with a breakout on the same generated table field or compatible Metric dimension used by the filter.

- Run a `useMetabaseQuery` breakout on the same table field or Metric dimension used by `filter(...)`, then derive a deduped option list from returned rows.
- Prefer querying options from the same source used by the charts so the option list stays compatible with the filter.
- Treat categorical labels as runtime values unless the user explicitly provides a closed enum. Field names in the generated schema are not value lists.
- Use a searchable picker/combobox for entity filters and long runtime option lists.

For Metric-backed cards, use the table source plus generated Metric aggregation. Use the generated Metric dimension in both the options query and the visible card query when the dimension belongs to that table source:

```ts
const ordersTable = schema.tables.orders;
const revenueMetric = schema.metrics.revenue;
const franchiseDimension = revenueMetric.dimensions.orders.franchiseId;

const { data: optionData } = useMetabaseQuery<typeof ordersTable>({
  source: ordersTable,
  aggregations: [revenueMetric],
  breakouts: [breakout(franchiseDimension)],
});

const revenueFilters =
  selectedFranchise === "all"
    ? []
    : [filter(franchiseDimension, "=", selectedFranchise)];
```

Do not use source-card Metrics in table-source filter queries. Wait for saved-question source support, then pair those Metrics with `source: schema.questions.<question>` instead.

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
- Keep one filter array per queried table when charts use different date fields.
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

Include a Custom range option in date preset bars by default. Omit it only when the user explicitly asks for fixed presets only or no date range control. Order presets as durations first, then All time, then Custom last.

### Use the built-in `DateRangePicker`

`DateRangePicker` is the custom-range control. It comes from the SDK, so there is no dependency to install, no CSS to import, and no theming to match by hand — it already looks like the SDK components beside it.

```tsx
import { DateRangePicker } from "@metabase/embedding-sdk-react/data-app";

const [range, setRange] = useState<[string | null, string | null]>([
  null,
  null,
]);
const [start, end] = range;

const dateFilters =
  start && end
    ? [filter(ordersTable.fields.createdAt, "between", [start, end])]
    : [];

<DateRangePicker value={range} onChange={setRange} clearable />;
```

Both ends are `YYYY-MM-DD` strings — the same shape `filter(...)` takes, so there is no `Date` conversion and no time zone to get wrong.

- `onChange` fires on every calendar click, so it reports half-picked ranges as `[start, null]`. Build the filter only when both ends are set; a half-picked range means no date filter, not a sentinel date.
- Props: `value` / `defaultValue` / `onChange`, `label`, `placeholder`, `minDate`, `maxDate`, `clearable`, `disabled`, `numberOfColumns` (months shown side by side, default 2), `valueFormat` (dayjs format for the input text), `className`, `style`.
- Size and place it with `style` or `className` on the picker itself. It renders at its content width by default.
- Drop it straight into a preset bar as the Custom option — it needs no `customInput` or `forwardRef` wrapper to open its popover.

### Falling back to a third-party picker

Only for what `DateRangePicker` does not cover, such as single-date or date-time selection. Nothing else justifies a picker dependency — `react-datepicker`, `react-day-picker`, `flatpickr`, `@mui/x-date-pickers`, `antd` and `rsuite` are all the same mistake for a plain date range. The default data-app template ships React, React DOM, and the Metabase SDK, so this adds a dependency:

```bash
npm install react-datepicker
```

`react-datepicker` is the default pick; the rest of this section assumes it.

- Do not install a large UI suite just for one data-app date filter.
- Import `react-datepicker/dist/react-datepicker.css`, then add small CSS overrides for the app's visual style if needed.
- Type strict `react-datepicker` callbacks explicitly, for example `onChange={(date: Date | null) => ...}` for single-date pickers.
- If the control should look like the other preset buttons, use `customInput` with a `forwardRef` button, spread react-datepicker's injected props, and call its injected `onClick` so the popover still opens.
- Convert selected dates to ISO `YYYY-MM-DD` strings with local date getters (`getFullYear`, `getMonth`, `getDate`) rather than `toISOString()`.
- For date-picker `selected` props, parse saved strings defensively and pass `null` for empty or invalid values. Never pass `new Date("")`.
- Recent `react-datepicker` packages include their own TypeScript types; do not add `@types/react-datepicker` unless the installed version actually needs it.
