import { COLUMNS, type ColumnSpec, type Kind } from "./catalog";
import type { FormulaProblem, FormulaToken, MetricDraft } from "./formula";

/** Why the columns of a dimension belong together, strongest first. */
export type Tier = "field" | "name" | "semantic";

/** Something a pill can be filtered or broken out by: one column per table it reads. */
export type Dimension = {
  id: string;
  label: string;
  kind: Kind;
  values?: string[];
  tier: Tier;
  columns: ColumnSpec[];
};

/** The author's changes to the default mapping, by dimension id. */
export type DimensionMapping = { confirmed: string[]; removed: string[] };

export const EMPTY_MAPPING: DimensionMapping = { confirmed: [], removed: [] };

/** A measure or a metric in a formula, with the dimensions it offers. */
export type Pill = { id: string; name: string; dimensions: Dimension[] };

export type MetricDimensions = {
  /** In the metric: every pill has a column for each. */
  mapped: Dimension[];
  /** Every pill has a column, but the author has to confirm they match. */
  suggested: Dimension[];
  /** Only some pills have it, so it only filters those pills. */
  unshared: { dimension: Dimension; pills: string[] }[];
};

export type Resolver = {
  /** A measure or a one-table metric, with its table's dimensions. */
  leaf: (id: string) => Pill | null;
  /** The definition of a metric that is itself math over other pills. */
  inner: (id: string) => MetricDraft | null;
};

const TIERS: Tier[] = ["field", "name", "semantic"];

const columnKey = (column: ColumnSpec) => `${column.table}/${column.label}`;

const idOf = (columns: ColumnSpec[]) => columns.map(columnKey).sort().join("|");

const uniqueBy = <T>(items: T[], keyOf: (item: T) => string) =>
  items.filter(
    (item, index) =>
      items.findIndex((other) => keyOf(other) === keyOf(item)) === index,
  );

/** The one value every column shares, if they all do. */
const shared = (
  dimension: Dimension,
  read: (column: ColumnSpec) => string | undefined,
) => {
  const values = new Set(dimension.columns.map(read));
  const [value] = values;
  return values.size === 1 ? value : undefined;
};

const MATCHES: Record<Tier, (a: Dimension, b: Dimension) => boolean> = {
  field: (a, b) => {
    const field = shared(a, (column) => column.field);
    return field != null && field === shared(b, (column) => column.field);
  },
  name: (a, b) => a.label === b.label && a.kind === b.kind,
  semantic: (a, b) => {
    const semantic = shared(a, (column) => column.semantic);
    return (
      semantic != null &&
      a.kind === b.kind &&
      semantic === shared(b, (column) => column.semantic)
    );
  },
};

const weakest = (tiers: Tier[]) =>
  TIERS[Math.max(...tiers.map((tier) => TIERS.indexOf(tier)))];

export const tableDimensions = (table: string): Dimension[] =>
  COLUMNS.filter((column) => column.table === table).map((column) => ({
    id: idOf([column]),
    label: column.label,
    kind: column.kind,
    values: column.values,
    tier: "field",
    columns: [column],
  }));

/**
 * The dimensions of a metric built from these pills. A dimension needs a
 * column in every pill: the same column or one with the same name is mapped
 * by default, one that only holds the same kind of thing is suggested.
 */
export function combineDimensions(
  pills: Pill[],
  mapping: DimensionMapping,
): MetricDimensions {
  const distinct = uniqueBy(pills, (pill) => pill.id);
  const [first, ...others] = distinct;
  if (!first) {
    return { mapped: [], suggested: [], unshared: [] };
  }

  const used = new Set<Dimension>();
  const combined: Dimension[] = [];
  for (const tier of TIERS) {
    for (const dimension of first.dimensions) {
      if (used.has(dimension)) {
        continue;
      }
      const partners = others.map((pill) =>
        pill.dimensions.find(
          (candidate) =>
            !used.has(candidate) && MATCHES[tier](dimension, candidate),
        ),
      );
      const found = partners.filter((partner) => partner != null);
      if (found.length < others.length) {
        continue;
      }
      const all = [dimension, ...found];
      all.forEach((member) => used.add(member));
      const columns = uniqueBy(
        all.flatMap((member) => member.columns),
        columnKey,
      );
      combined.push({
        id: idOf(columns),
        label: dimension.label,
        kind: dimension.kind,
        values: dimension.values,
        tier: weakest([tier, ...all.map((member) => member.tier)]),
        columns,
      });
    }
  }

  const isMapped = (dimension: Dimension) =>
    dimension.tier === "semantic"
      ? mapping.confirmed.includes(dimension.id)
      : !mapping.removed.includes(dimension.id);

  const left = distinct.flatMap((pill) =>
    pill.dimensions
      .filter((dimension) => !used.has(dimension))
      .map((dimension) => ({ dimension, pill: pill.name })),
  );
  // One row per name, also when several pills have it but not all of them.
  const nameOf = ({ label, kind }: Dimension) => `${label}/${kind}`;
  const unshared = uniqueBy(left, ({ dimension }) => nameOf(dimension)).map(
    ({ dimension }) => {
      const same = left.filter(
        (other) => nameOf(other.dimension) === nameOf(dimension),
      );
      const columns = uniqueBy(
        same.flatMap((other) => other.dimension.columns),
        columnKey,
      );
      return {
        dimension: { ...dimension, id: idOf(columns), columns },
        pills: same.map((other) => other.pill),
      };
    },
  );

  return {
    mapped: combined.filter(isMapped),
    suggested: combined.filter((dimension) => !isMapped(dimension)),
    unshared,
  };
}

/** Puts a suggested dimension in the metric. */
export const mapDimension = (
  mapping: DimensionMapping,
  { id, tier }: Dimension,
): DimensionMapping =>
  tier === "semantic"
    ? { ...mapping, confirmed: [...mapping.confirmed, id] }
    : { ...mapping, removed: mapping.removed.filter((other) => other !== id) };

/** Takes a dimension out of the metric; it stays suggested. */
export const unmapDimension = (
  mapping: DimensionMapping,
  { id, tier }: Dimension,
): DimensionMapping =>
  tier === "semantic"
    ? {
        ...mapping,
        confirmed: mapping.confirmed.filter((other) => other !== id),
      }
    : { ...mapping, removed: [...mapping.removed, id] };

/** The pill's dimensions: its table's, or for math over pills, the mapped ones. */
export function pillOf(id: string, resolver: Resolver): Pill | null {
  const inner = resolver.inner(id);
  return inner
    ? {
        id,
        name: inner.name,
        dimensions: metricDimensions(inner, resolver).mapped,
      }
    : resolver.leaf(id);
}

export const pillsOf = (draft: MetricDraft, resolver: Resolver): Pill[] =>
  uniqueBy(
    draft.formula.flatMap((token) =>
      token.kind === "term" ? (pillOf(token.measureId, resolver) ?? []) : [],
    ),
    (pill) => pill.id,
  );

export const metricDimensions = (
  draft: MetricDraft,
  resolver: Resolver,
): MetricDimensions =>
  combineDimensions(pillsOf(draft, resolver), draft.mapping);

/** The label a filter like "Plan = Business" starts with, longest first. */
const leadingLabel = (filter: string, labels: string[]) =>
  labels
    .toSorted((a, b) => b.length - a.length)
    .find(
      (label) =>
        filter.toLowerCase().startsWith(label.toLowerCase()) &&
        !/^[a-z]/i.test(filter.slice(label.length)),
    );

const labelsOf = (dimensions: Dimension[]) =>
  dimensions.map((dimension) => dimension.label);

export const dimensionLabelOf = (filter: string): string | null =>
  leadingLabel(
    filter,
    COLUMNS.map((column) => column.label),
  ) ?? null;

/** The pill's own dimension behind one of the metric's. */
export const pillDimensionFor = (pill: Pill, dimension: Dimension) =>
  pill.dimensions.find((candidate) =>
    candidate.columns.some((column) =>
      dimension.columns.some((other) => columnKey(other) === columnKey(column)),
    ),
  );

/** The metric's filter, reading the pill's name for the same dimension. */
function relabel(filter: string, dimensions: Dimension[], pill: Pill | null) {
  const label = leadingLabel(filter, labelsOf(dimensions));
  const dimension = dimensions.find((candidate) => candidate.label === label);
  const own = dimension && pill && pillDimensionFor(pill, dimension);
  return own && label ? `${own.label}${filter.slice(label.length)}` : null;
}

/**
 * The definition as math over measures only: a metric that is itself math is
 * replaced by its parts, and every filter, the pill's and the whole metric's,
 * lands on each measure it applies to, reading that measure's column.
 */
export function flattenDraft(
  draft: MetricDraft,
  resolver: Resolver,
  extra: string[] = [],
  path = "",
): FormulaToken[] {
  const dimensions = metricDimensions(draft, resolver).mapped;
  const whole = [...draft.where.map(({ filter }) => filter), ...extra];
  return draft.formula.flatMap((token): FormulaToken[] => {
    const key = `${path}${token.key}`;
    if (token.kind !== "term") {
      return [{ ...token, key }];
    }
    const pill = pillOf(token.measureId, resolver);
    const passed = whole.flatMap(
      (filter) => relabel(filter, dimensions, pill) ?? [],
    );
    const filters = [...new Set([...token.filters, ...passed])];
    const inner = resolver.inner(token.measureId);
    if (!inner) {
      return [{ ...token, key, filters }];
    }
    const parts = flattenDraft(inner, resolver, filters, `${key}/`);
    return draft.formula.length === 1
      ? parts
      : [
          { key: `${key}/(`, kind: "paren", side: "(" },
          ...parts,
          { key: `${key}/)`, kind: "paren", side: ")" },
        ];
  });
}

const isFilterable = (dimension: Dimension) => dimension.kind !== "date";

/** A filter on something its pill, or the metric, has no dimension for. */
export function findFilterProblem(
  draft: MetricDraft,
  resolver: Resolver,
): FormulaProblem | null {
  for (const token of draft.formula) {
    const pill =
      token.kind === "term" ? pillOf(token.measureId, resolver) : null;
    if (token.kind !== "term" || !pill) {
      continue;
    }
    const labels = labelsOf(pill.dimensions.filter(isFilterable));
    const filter = token.filters.find(
      (candidate) => !leadingLabel(candidate, labels),
    );
    if (filter != null) {
      const label = dimensionLabelOf(filter) ?? filter;
      const reason = resolver.inner(token.measureId)
        ? " It only has the dimensions its measures share."
        : "";
      return {
        message: `${pill.name} can’t be filtered by ${label}.${reason}`,
        keys: [token.key],
      };
    }
  }
  const { mapped, suggested } = metricDimensions(draft, resolver);
  const labels = labelsOf(mapped.filter(isFilterable));
  const where = draft.where.find(({ filter }) => !leadingLabel(filter, labels));
  if (where) {
    const label = dimensionLabelOf(where.filter) ?? where.filter;
    const fix = leadingLabel(where.filter, labelsOf(suggested))
      ? "Map it in the Dimensions tab."
      : "Not every measure has it, so filter the one that does.";
    return {
      message: `${label} isn’t a dimension of this metric. ${fix}`,
      keys: [where.key],
    };
  }
  return null;
}
