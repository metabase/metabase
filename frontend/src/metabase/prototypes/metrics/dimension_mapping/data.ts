import { MONTHS } from "../data";

export type ColumnKind = "date" | "string";

export type Column = {
  id: string;
  /** "Orders → Paid At" */
  label: string;
  name: string;
  kind: ColumnKind;
};

/** One side of the formula: a measure on its own table. */
export type Term = {
  id: string;
  name: string;
  color: string;
  columns: Column[];
};

/** A dimension of the metric: which column of each term it reads. */
export type MetricDimension = {
  id: string;
  name: string;
  kind: ColumnKind;
  mapping: Record<string, string | null>;
  published: boolean;
};

const column = (table: string, name: string, kind: ColumnKind): Column => ({
  id: `${table}.${name}`,
  label: `${table} → ${name}`,
  name,
  kind,
});

export const TERMS: Term[] = [
  {
    id: "revenue",
    name: "Revenue",
    color: "var(--mb-color-accent0)",
    columns: [
      column("Orders", "Created At", "date"),
      column("Orders", "Paid At", "date"),
      column("Orders", "Country", "string"),
      column("Orders", "Plan", "string"),
      column("Orders", "Channel", "string"),
    ],
  },
  {
    id: "users",
    name: "Active users",
    color: "var(--mb-color-accent1)",
    columns: [
      column("Sessions", "Session Start", "date"),
      column("Users", "Signed Up At", "date"),
      column("Users", "Country", "string"),
      column("Sessions", "Device", "string"),
    ],
  },
];

export const INITIAL_DIMENSIONS: MetricDimension[] = [
  {
    id: "time",
    name: "Time",
    kind: "date",
    mapping: { revenue: "Orders.Paid At", users: "Sessions.Session Start" },
    published: true,
  },
  {
    id: "country",
    name: "Country",
    kind: "string",
    mapping: { revenue: "Orders.Country", users: "Users.Country" },
    published: true,
  },
];

export const SIGNUP_TIME: MetricDimension = {
  id: "signup",
  name: "Signup time",
  kind: "date",
  mapping: { revenue: null, users: "Users.Signed Up At" },
  published: false,
};

export const isConforming = (dimension: MetricDimension) =>
  TERMS.every((term) => dimension.mapping[term.id] != null);

export const columnOf = (term: Term, id: string | null | undefined) =>
  term.columns.find((candidate) => candidate.id === id);

/** Columns only one term has: not mapped by any dimension. */
export function unsharedColumns(dimensions: MetricDimension[]) {
  const mapped = new Set(
    dimensions.flatMap((dimension) => Object.values(dimension.mapping)),
  );
  return TERMS.flatMap((term) =>
    term.columns
      .filter((c) => c.kind === "string" && !mapped.has(c.id))
      .map((c) => ({ term, column: c })),
  );
}

const ramp = (start: number, step: number, wobble: number) =>
  MONTHS.map((_, i) =>
    Math.round(start + step * i + wobble * Math.sin(i * 1.3)),
  );

/** Mock monthly series of each term, by the time column it is read by. */
const SERIES: Record<string, number[]> = {
  "Orders.Created At": ramp(42000, 2400, 3000),
  "Orders.Paid At": [38000, ...ramp(42000, 2400, 3000).slice(0, -1)],
  "Sessions.Session Start": ramp(1800, 60, 90),
  "Users.Signed Up At": ramp(400, 35, 120),
};

export const COUNTRIES = ["United States", "Germany", "Brazil", "Japan"];

const BY_COUNTRY: Record<string, number[]> = {
  "Orders.Country": [210000, 96000, 54000, 61000],
  "Users.Country": [8200, 3100, 2900, 1700],
};

const ratio = (top: number[], bottom: number[]) =>
  top.map((value, i) => Math.round((value / (bottom[i] || 1)) * 100) / 100);

export function seriesFor(dimension: MetricDimension): number[] | null {
  const [revenue, users] = TERMS.map((term) => dimension.mapping[term.id]);
  if (!revenue || !users) {
    return null;
  }
  const source = dimension.kind === "date" ? SERIES : BY_COUNTRY;
  return ratio(source[revenue] ?? [], source[users] ?? []);
}
