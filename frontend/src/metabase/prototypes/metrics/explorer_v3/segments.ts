import type { BarItem } from "./TokenBar";
import { matchesItem } from "./TokenBar";
import type { MetricDraft } from "./formula";

/** A named filter on a table: what a pill in the definition is filtered by. */
export type Segment = {
  id: string;
  name: string;
  table: string;
  /** Filters in the bar's own syntax, like "Quantity ≥ 5". */
  conditions: string[];
};

export const SEGMENT_PREFIX = "segment:";

/** Picking this opens the New segment flow; what follows is a suggested name. */
export const NEW_SEGMENT_PREFIX = "new-segment:";

/** Mock segments per table, as if saved in the Library. */
export const SEGMENTS: Segment[] = [
  {
    id: "segment:orders-discounted",
    name: "With a discount",
    table: "Orders",
    conditions: ["Discount is not empty"],
  },
  {
    id: "segment:orders-gizmo",
    name: "Gizmos",
    table: "Orders",
    conditions: ["Product category = Gizmo"],
  },
  {
    id: "segment:orders-large",
    name: "Large orders",
    table: "Orders",
    conditions: ["Quantity ≥ 5"],
  },
  {
    id: "segment:orders-google",
    name: "From Google",
    table: "Orders",
    conditions: ["Source = Google"],
  },
  {
    id: "segment:people-google",
    name: "From Google",
    table: "People",
    conditions: ["Source = Google"],
  },
  {
    id: "segment:people-organic",
    name: "Organic",
    table: "People",
    conditions: ["Source = Organic"],
  },
  {
    id: "segment:accounts-converted",
    name: "Converted trials",
    table: "Accounts",
    conditions: ["Trial converted = true"],
  },
  {
    id: "segment:accounts-business",
    name: "Business plan",
    table: "Accounts",
    conditions: ["Plan = Business"],
  },
  {
    id: "segment:accounts-active",
    name: "Active",
    table: "Accounts",
    conditions: ["Active subscription = true"],
  },
  {
    id: "segment:invoices-business",
    name: "Business plan",
    table: "Invoices",
    conditions: ["Plan = Business"],
  },
  {
    id: "segment:invoices-large",
    name: "Large payments",
    table: "Invoices",
    conditions: ["Payment ≥ 100"],
  },
  {
    id: "segment:reviews-five-stars",
    name: "Five stars",
    table: "Reviews",
    conditions: ["Rating = 5"],
  },
];

/** A segment that is this one filter, on the table if one is given. */
export const segmentFor = (
  segments: Segment[],
  filter: string,
  table?: string,
) => {
  const matches = segments.filter(
    ({ conditions }) => conditions.length === 1 && conditions[0] === filter,
  );
  return matches.find((segment) => segment.table === table) ?? matches[0];
};

/** The draft with each pill's raw filters turned into segments, where one matches. */
export const toSegments = (
  draft: MetricDraft,
  segments: Segment[],
  tableOf: (measureId: string) => string | undefined,
): MetricDraft => ({
  ...draft,
  formula: draft.formula.map((token) =>
    token.kind === "term"
      ? {
          ...token,
          filters: token.filters.map(
            (filter) =>
              segmentFor(segments, filter, tableOf(token.measureId))?.id ??
              filter,
          ),
        }
      : token,
  ),
});

/** The draft with each pill's segments replaced by their conditions, to run it. */
export const expandSegments = (
  draft: MetricDraft,
  segments: Segment[],
): MetricDraft => ({
  ...draft,
  formula: draft.formula.map((token) =>
    token.kind === "term"
      ? {
          ...token,
          filters: [
            ...new Set(
              token.filters.flatMap(
                (id) =>
                  segments.find((segment) => segment.id === id)?.conditions ?? [
                    id,
                  ],
              ),
            ),
          ],
        }
      : token,
  ),
});

/** The dropdown for a pill's segments: the ones it can use, then New segment. */
export function segmentItems(
  available: Segment[],
  query: string,
  exclude: string[],
): BarItem[] {
  const items = available
    .filter((segment) => !exclude.includes(segment.id))
    .map(
      (segment): BarItem => ({
        id: segment.id,
        label: segment.name,
        icon: "segment",
        description: segment.conditions.join(", "),
        section: `Segments of ${segment.table}`,
        sectionIcon: "table",
      }),
    )
    .filter((item) => matchesItem(item, query));
  const name = query.trim();
  return [
    ...items,
    {
      id: `${NEW_SEGMENT_PREFIX}${name}`,
      label: name ? `New segment “${name}”` : "New segment",
      icon: "add",
      section: "Create",
      sectionIcon: "add",
    },
  ];
}
