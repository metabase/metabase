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

export const MEASURES: Measure[] = [
  {
    id: "revenue",
    name: "Revenue",
    table: "Orders",
    aggregation: "Sum of Total",
    series: ramp(42000, 2100, 3500),
  },
  {
    id: "discount",
    name: "Discounts",
    table: "Orders",
    aggregation: "Sum of Discount",
    series: ramp(3100, 120, 400),
  },
  {
    id: "orders",
    name: "Order count",
    table: "Orders",
    aggregation: "Count",
    series: ramp(820, 35, 60),
  },
  {
    id: "cogs",
    name: "Cost of goods",
    table: "Products",
    aggregation: "Sum of Cost",
    series: ramp(23000, 900, 1800),
  },
  {
    id: "hours",
    name: "Billable hours",
    table: "Timesheets",
    aggregation: "Sum of Hours",
    series: ramp(1400, 20, 90),
  },
  {
    id: "deals",
    name: "Deals",
    table: "Deals",
    aggregation: "Count",
    series: ramp(140, 6, 18),
  },
];

export const FILTERS = [
  "Status = closed",
  "Status = finalized",
  "Channel = Online",
  "Segment: Enterprise",
  "Created At: last 12 months",
];

export const DIMENSIONS = ["Created At", "Category", "Channel", "Region"];

export const getMeasure = (id: string) =>
  MEASURES.find((measure) => measure.id === id) ?? MEASURES[0];

export const formatNumber = (value: number) =>
  Math.abs(value) >= 1000
    ? `${(value / 1000).toFixed(1)}k`
    : Number.isInteger(value)
      ? String(value)
      : value.toFixed(2);
