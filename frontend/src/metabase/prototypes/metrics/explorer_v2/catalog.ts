/**
 * The Sample Database measures created for this prototype on the local
 * instance, by name. The list endpoint doesn't return tables, so they live here.
 */
export const MEASURE_TABLES: Record<string, string> = {
  Revenue: "Orders",
  Discounts: "Orders",
  Tax: "Orders",
  Orders: "Orders",
  "Units sold": "Orders",
  "New customers": "People",
  "New accounts": "Accounts",
  Seats: "Accounts",
  Payments: "Invoices",
  Reviews: "Reviews",
};

export type Kind = "string" | "number" | "boolean" | "date";

/** A column a filter can read, by the label the bar shows. */
export type ColumnSpec = {
  label: string;
  table: string;
  column: string;
  /** For a column reached through a foreign key, like Product → Category. */
  via?: string;
  kind: Kind;
  /** Values to suggest, like a category's. */
  values?: string[];
  /** The column itself, wherever it's reached from: "People.Source". */
  field: string;
  /** What the column holds, to suggest mapping it to one named differently. */
  semantic?: string;
};

const CATEGORIES = ["Doohickey", "Gadget", "Gizmo", "Widget"];
const SOURCES = ["Affiliate", "Facebook", "Google", "Organic", "Twitter"];
const PLANS = ["Basic", "Business", "Premium"];

export const COLUMNS: ColumnSpec[] = [
  {
    label: "Total",
    table: "Orders",
    column: "Total",
    kind: "number",
    field: "Orders.Total",
  },
  {
    label: "Subtotal",
    table: "Orders",
    column: "Subtotal",
    kind: "number",
    field: "Orders.Subtotal",
  },
  {
    label: "Tax",
    table: "Orders",
    column: "Tax",
    kind: "number",
    field: "Orders.Tax",
  },
  {
    label: "Discount",
    table: "Orders",
    column: "Discount",
    kind: "number",
    field: "Orders.Discount",
  },
  {
    label: "Quantity",
    table: "Orders",
    column: "Quantity",
    kind: "number",
    field: "Orders.Quantity",
  },
  {
    label: "Product category",
    table: "Orders",
    via: "Product",
    column: "Category",
    kind: "string",
    values: CATEGORIES,
    field: "Products.Category",
  },
  {
    label: "Source",
    table: "People",
    column: "Source",
    kind: "string",
    values: SOURCES,
    field: "People.Source",
  },
  {
    label: "Plan",
    table: "Accounts",
    column: "Plan",
    kind: "string",
    values: PLANS,
    field: "Accounts.Plan",
  },
  {
    label: "Seats",
    table: "Accounts",
    column: "Seats",
    kind: "number",
    field: "Accounts.Seats",
  },
  {
    label: "Trial converted",
    table: "Accounts",
    column: "Trial Converted",
    kind: "boolean",
    field: "Accounts.Trial Converted",
  },
  {
    label: "Active subscription",
    table: "Accounts",
    column: "Active Subscription",
    kind: "boolean",
    field: "Accounts.Active Subscription",
  },
  {
    label: "Plan",
    table: "Invoices",
    column: "Plan",
    kind: "string",
    values: PLANS,
    field: "Invoices.Plan",
  },
  {
    label: "Payment",
    table: "Invoices",
    column: "Payment",
    kind: "number",
    field: "Invoices.Payment",
  },
  {
    label: "Rating",
    table: "Reviews",
    column: "Rating",
    kind: "number",
    field: "Reviews.Rating",
  },
  // Columns reached through a foreign key, so other tables share them.
  {
    label: "Source",
    table: "Orders",
    via: "User",
    column: "Source",
    kind: "string",
    values: SOURCES,
    field: "People.Source",
  },
  {
    label: "Product category",
    table: "Reviews",
    via: "Product",
    column: "Category",
    kind: "string",
    values: CATEGORIES,
    field: "Products.Category",
  },
  {
    label: "Country",
    table: "Accounts",
    column: "Country",
    kind: "string",
    field: "Accounts.Country",
  },
  {
    label: "Country",
    table: "Invoices",
    via: "Account",
    column: "Country",
    kind: "string",
    field: "Accounts.Country",
  },
  // Each table's own date: the same kind of column, not the same column.
  ...["Orders", "People", "Accounts", "Reviews"].map(
    (table): ColumnSpec => ({
      label: "Created At",
      table,
      column: "Created At",
      kind: "date",
      field: `${table}.Created At`,
      semantic: "creation-date",
    }),
  ),
  {
    label: "Date Received",
    table: "Invoices",
    column: "Date Received",
    kind: "date",
    field: "Invoices.Date Received",
    semantic: "creation-date",
  },
];

/** The column each measure adds up, offered first when filtering it. */
export const MEASURE_COLUMNS: Record<string, string> = {
  Revenue: "Total",
  Discounts: "Discount",
  Tax: "Tax",
  "Units sold": "Quantity",
  Seats: "Seats",
  Payments: "Payment",
};

/** A named filter on one table. Anything worth filtering a metric by gets a name. */
export type SegmentSpec = {
  name: string;
  table: string;
  /** What it filters, read like a filter typed in the bar: "Quantity ≥ 5". */
  filter: string;
};

export const SEGMENTS: SegmentSpec[] = [
  { name: "Large orders", table: "Orders", filter: "Quantity ≥ 5" },
  {
    name: "Discounted orders",
    table: "Orders",
    filter: "Discount is not empty",
  },
  { name: "Gizmo orders", table: "Orders", filter: "Product category = Gizmo" },
  { name: "From Google", table: "People", filter: "Source = Google" },
  {
    name: "Converted trials",
    table: "Accounts",
    filter: "Trial converted = true",
  },
  { name: "Business plan", table: "Accounts", filter: "Plan = Business" },
  { name: "Good reviews", table: "Reviews", filter: "Rating ≥ 4" },
];

/** How a pill's filter list refers to a segment, next to filters typed out. */
export const SEGMENT_PREFIX = "segment:";

export const segmentNameOf = (filter: string) =>
  filter.startsWith(SEGMENT_PREFIX)
    ? filter.slice(SEGMENT_PREFIX.length)
    : null;

/** What a pill shows for a filter: the segment's name, or the filter itself. */
export const filterLabel = (filter: string) => segmentNameOf(filter) ?? filter;
