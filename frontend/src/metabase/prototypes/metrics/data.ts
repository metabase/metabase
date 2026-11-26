/** Mock catalog for the Metrics 3.0 lo-fi prototypes. Numbers are made up. */

export type Measure = {
  id: string;
  name: string;
  table: string;
  aggregation: string;
  /** Monthly values, Jan..Dec. */
  series: number[];
};

export const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const ramp = (start: number, step: number, wobble: number) =>
  MONTHS.map((_, i) =>
    Math.round(start + step * i + wobble * Math.sin(i * 1.3)),
  );

/** The editor's Sample Database measures (see explorer/examples.ts), with mock numbers. */
export const MEASURES: Measure[] = [
  {
    id: "revenue",
    name: "Revenue",
    table: "Orders",
    aggregation: "Sum of Total",
    series: ramp(42000, 2100, 3500),
  },
  {
    id: "discounts",
    name: "Discounts",
    table: "Orders",
    aggregation: "Sum of Discount",
    series: ramp(3100, 120, 400),
  },
  {
    id: "tax",
    name: "Tax",
    table: "Orders",
    aggregation: "Sum of Tax",
    series: ramp(2600, 110, 250),
  },
  {
    id: "orders",
    name: "Orders",
    table: "Orders",
    aggregation: "Count",
    series: ramp(820, 35, 60),
  },
  {
    id: "units-sold",
    name: "Units sold",
    table: "Orders",
    aggregation: "Sum of Quantity",
    series: ramp(3100, 140, 220),
  },
  {
    id: "new-customers",
    name: "New customers",
    table: "People",
    aggregation: "Count",
    series: ramp(210, 9, 25),
  },
  {
    id: "new-accounts",
    name: "New accounts",
    table: "Accounts",
    aggregation: "Count",
    series: ramp(140, 6, 18),
  },
  {
    id: "seats",
    name: "Seats",
    table: "Accounts",
    aggregation: "Sum of Seats",
    series: ramp(1900, 70, 120),
  },
  {
    id: "payments",
    name: "Payments",
    table: "Invoices",
    aggregation: "Sum of Payment",
    series: ramp(18000, 600, 1400),
  },
  {
    id: "reviews",
    name: "Reviews",
    table: "Reviews",
    aggregation: "Count",
    series: ramp(95, 3, 12),
  },
];

/** The editor's filters on the Sample Database. */
export const FILTERS = [
  "Product category = Gizmo",
  "Product category = Widget",
  "Discount is not empty",
  "Quantity ≥ 5",
  "Source = Affiliate",
  "Source = Google",
  "Trial converted = true",
  "Active subscription = true",
  "Plan = Business",
  "Plan = Premium",
  "Rating ≥ 4",
];

export const DIMENSIONS = ["Created At", "Category", "Source", "Plan"];

export const getMeasure = (id: string) =>
  MEASURES.find((measure) => measure.id === id) ?? MEASURES[0];

export const formatNumber = (value: number) =>
  Math.abs(value) >= 1000
    ? `${(value / 1000).toFixed(1)}k`
    : Number.isInteger(value)
      ? String(value)
      : value.toFixed(2);
