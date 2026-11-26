/* eslint-disable boundaries/element-types -- throwaway prototype: reads the Metric Explorer's dimensions. */
import { getDimensionsByType } from "metabase/metrics-viewer/utils";
import * as LibMetric from "metabase-lib/metric";
import type { IconName } from "metabase-types/api";

import { COLUMNS, type ColumnSpec } from "./catalog";
import {
  type Dimension,
  type DimensionMapping,
  EMPTY_MAPPING,
  type Resolver,
  combineDimensions,
  pillsOf,
  tablesOf,
} from "./dimensions";
import type { MetricDraft } from "./formula";

type FieldType = "time" | "geo" | "category" | "boolean" | "numeric";

/** A real field of one measure, as the Metric Explorer knows it. */
export type Field = {
  /** The Explorer's id for it, within its measure. */
  id: string;
  sourceId: string;
  /** The column's own name, like "Source". */
  column: string;
  /** The foreign key it is reached through, like "User". */
  group?: string;
  type: FieldType;
  icon: IconName;
  semantic: string | null;
  /** The same for one column wherever it is reached from. */
  fieldKey: string;
  /** The column in the database, to look up where it lives. */
  fieldId: number | null;
  isDefault: boolean;
};

/** Something one pill can be charted by: a field per measure the pill reads. */
export type PillDimension = {
  id: string;
  name: string;
  type: FieldType;
  icon: IconName;
  semantic: string | null;
  /** Set when every measure reads the same column. */
  fieldKey: string | null;
  isDefault: boolean;
  isMain: boolean;
  targets: Record<string, Field>;
};

export type PanelPill = {
  id: string;
  name: string;
  dimensions: PillDimension[];
  isLoading: boolean;
};

/** How a dimension came to be: found by the editor, or put together by hand. */
export type Origin = "time" | "field" | "name" | "semantic" | "custom";

export type MetricDimension = {
  id: string;
  name: string;
  type: FieldType;
  icon: IconName;
  origin: Origin;
  /** The pill's own dimension it reads, by pill id. */
  picks: Record<string, PillDimension>;
  /** The pills it has no field for yet, by name. */
  missing: string[];
  /** The pills read different columns, so it's worth a look. */
  differs: boolean;
  targets: Record<string, Field>;
};

/** The author's changes to the dimensions the editor found. */
export type PanelMapping = {
  removed: string[];
  confirmed: string[];
  /** Dimensions put together by hand. */
  added: string[];
  names: Record<string, string>;
  /** A field chosen by hand: dimension id, then pill id, to the pill's dimension. */
  picks: Record<string, Record<string, string>>;
};

export const EMPTY_PANEL: PanelMapping = {
  removed: [],
  confirmed: [],
  added: [],
  names: {},
  picks: {},
};

export type PanelModel = {
  pills: PanelPill[];
  /** In the metric: filters and breakouts can use them. */
  mapped: MetricDimension[];
  /** Every pill has a field, but the author hasn't said they match. */
  suggested: MetricDimension[];
  /** Taken out by the author. */
  removed: MetricDimension[];
  /** Some pills still have no field. */
  incomplete: MetricDimension[];
  isLoading: boolean;
};

const KEYS = new Set(["type/PK", "type/FK"]);

const label = (field: Pick<Field, "column" | "group">) =>
  field.group ? `${field.group} - ${field.column}` : field.column;

/** The measure's real fields, each as a dimension of its own. */
function fieldsOf(
  definition: LibMetric.MetricDefinition,
  sourceId: string,
): PillDimension[] {
  return [...getDimensionsByType(definition).values()].map((descriptor) => {
    const info = LibMetric.toMetricDimension(descriptor.dimensionMetadata);
    const group =
      descriptor.group?.type === "connection"
        ? descriptor.group.displayName
        : undefined;
    const field: Field = {
      id: descriptor.id,
      sourceId,
      column: descriptor.displayName,
      group,
      type: descriptor.dimensionType,
      icon: descriptor.icon,
      semantic: info.semantic_type,
      fieldKey: String(info.sources?.[0]?.["field-id"] ?? descriptor.id),
      fieldId: info.sources?.[0]?.["field-id"] ?? null,
      isDefault: descriptor.isDefault,
    };
    return {
      id: field.id,
      name: label(field),
      type: field.type,
      icon: field.icon,
      semantic: field.semantic,
      fieldKey: field.fieldKey,
      isDefault: field.isDefault,
      isMain: group == null,
      targets: { [sourceId]: field },
    };
  });
}

/** The one value all of them share, if they do. */
const shared = <T>(values: T[]): T | null =>
  values.length > 0 && values.every((value) => value === values[0])
    ? values[0]
    : null;

const MATCHES: Record<
  "field" | "name" | "semantic",
  (a: PillDimension, b: PillDimension) => boolean
> = {
  field: (a, b) => a.fieldKey != null && a.fieldKey === b.fieldKey,
  name: (a, b) =>
    a.type === b.type &&
    a.isMain === b.isMain &&
    a.name.toLowerCase() === b.name.toLowerCase(),
  semantic: (a, b) =>
    a.type === b.type &&
    a.semantic != null &&
    !KEYS.has(a.semantic) &&
    a.semantic === b.semantic,
};

const dates = (pill: PanelPill) =>
  pill.dimensions.filter((dimension) => dimension.type === "time");

/**
 * The date a pill is charted over when nobody chose one: its curated default,
 * else when its own rows were created, not just any date on them, like a
 * birth date.
 */
const defaultDate = (pill: PanelPill) =>
  dates(pill).find((dimension) => dimension.isDefault) ??
  dates(pill).find(
    (dimension) =>
      dimension.isMain && dimension.semantic === "type/CreationTimestamp",
  ) ??
  dates(pill).find((dimension) => dimension.isMain) ??
  dates(pill)[0];

/**
 * The metric's dimensions. Each needs a field in every pill: one "Time", then
 * the same column or one with the same name, are in the metric from the
 * start; columns that only hold the same kind of thing are suggested. The
 * author's own choices are laid over that.
 */
export function combine(pills: PanelPill[], mapping: PanelMapping): PanelModel {
  const isLoading = pills.some((pill) => pill.isLoading);
  const [first, ...others] = pills;
  if (!first || isLoading) {
    return {
      pills,
      mapped: [],
      suggested: [],
      removed: [],
      incomplete: [],
      isLoading,
    };
  }

  const used = new Set<PillDimension>();
  const seen = new Set<string>();
  const keyOf = (picks: PillDimension[]) =>
    picks.map((pick) => pick.id).join("|");
  const found: { origin: Origin; picks: PillDimension[] }[] = [];
  const take = (origin: Origin, picks: PillDimension[]) => {
    picks.forEach((pick) => used.add(pick));
    seen.add(keyOf(picks));
    found.push({ origin, picks });
  };

  const defaults = pills.flatMap((pill) => defaultDate(pill) ?? []);
  if (pills.length > 1 && defaults.length === pills.length) {
    take("time", defaults);
  }
  for (const tier of ["field", "name", "semantic"] as const) {
    // A field can sit in several dimensions: an account's plan is the same
    // field as an invoice's account's plan, and has the same name as the
    // invoice's own plan. Only the guesses stay off fields already placed.
    const isGuess = tier === "semantic";
    for (const dimension of first.dimensions) {
      if (isGuess && used.has(dimension)) {
        continue;
      }
      const partners = others.flatMap(
        (pill) =>
          pill.dimensions.find(
            (candidate) =>
              !(isGuess && used.has(candidate)) &&
              MATCHES[tier](dimension, candidate),
          ) ?? [],
      );
      const picks = [dimension, ...partners];
      if (partners.length === others.length && !seen.has(keyOf(picks))) {
        take(tier, picks);
      }
    }
  }

  const build = (
    id: string,
    origin: Origin,
    base: Record<string, PillDimension>,
  ): MetricDimension => {
    const chosen = mapping.picks[id] ?? {};
    const picks: Record<string, PillDimension> = {};
    for (const pill of pills) {
      const pick =
        pill.id in chosen
          ? pill.dimensions.find(
              (dimension) => dimension.id === chosen[pill.id],
            )
          : base[pill.id];
      if (pick) {
        picks[pill.id] = pick;
      }
    }
    const list = pills.flatMap((pill) => picks[pill.id] ?? []);
    const hasOtherDates =
      origin === "time" && pills.some((pill) => dates(pill).length > 1);
    return {
      id,
      origin,
      name:
        mapping.names[id] ??
        (origin === "time" ? "Time" : (list[0]?.name ?? "New dimension")),
      type: list[0]?.type ?? "category",
      icon: list[0]?.icon ?? "label",
      picks,
      missing: pills.filter((pill) => !picks[pill.id]).map((pill) => pill.name),
      differs:
        hasOtherDates ||
        (list.length > 1 &&
          shared(list.map((dimension) => dimension.fieldKey)) == null),
      targets: Object.fromEntries(
        list.flatMap((dimension) => Object.entries(dimension.targets)),
      ),
    };
  };

  const all = [
    ...found.map(({ origin, picks }) =>
      build(
        origin === "time"
          ? "time"
          : `${origin}:${picks.map((pick, i) => `${pills[i].id}/${pick.id}`).join("|")}`,
        origin,
        Object.fromEntries(picks.map((pick, i) => [pills[i].id, pick])),
      ),
    ),
    ...mapping.added.map((id) => build(id, "custom", {})),
  ];
  const complete = all.filter((dimension) => dimension.missing.length === 0);
  const isIn = ({ id, origin }: MetricDimension) =>
    origin === "semantic"
      ? mapping.confirmed.includes(id)
      : !mapping.removed.includes(id);

  return {
    pills,
    mapped: complete.filter(isIn),
    suggested: complete.filter(
      (dimension) => !isIn(dimension) && dimension.origin === "semantic",
    ),
    removed: complete.filter(
      (dimension) => !isIn(dimension) && dimension.origin !== "semantic",
    ),
    incomplete: all.filter((dimension) => dimension.missing.length > 0),
    isLoading,
  };
}

type Sources = {
  name: (id: string) => string;
  definition: (id: string) => LibMetric.MetricDefinition | null;
  /** The definition of a metric that is itself math over other pills. */
  inner: (id: string) => MetricDraft | null;
};

function pillOf(id: string, sources: Sources): PanelPill {
  const inner = sources.inner(id);
  if (inner) {
    // A metric that is math over measures offers what it has in common.
    const model = panelModel(inner, sources);
    return {
      id,
      name: inner.name,
      isLoading: model.isLoading,
      dimensions: model.mapped.map((dimension) => {
        const picks = Object.values(dimension.picks);
        return {
          id: dimension.id,
          name: dimension.name,
          type: dimension.type,
          icon: dimension.icon,
          semantic: shared(picks.map((pick) => pick.semantic)),
          fieldKey: shared(picks.map((pick) => pick.fieldKey)),
          isDefault: dimension.origin === "time",
          isMain: picks.every((pick) => pick.isMain),
          targets: dimension.targets,
        };
      }),
    };
  }
  const definition = sources.definition(id);
  return {
    id,
    name: sources.name(id),
    isLoading: definition == null,
    dimensions: definition ? fieldsOf(definition, id) : [],
  };
}

/** One pill per measure or metric in the formula, however often it's used. */
export function panelModel(draft: MetricDraft, sources: Sources): PanelModel {
  const ids = [
    ...new Set(
      draft.formula.flatMap((token) =>
        token.kind === "term" ? [token.measureId] : [],
      ),
    ),
  ];
  return combine(
    ids.map((id) => pillOf(id, sources)),
    draft.panel,
  );
}

/** Whether a pill's dimension is read by one of the metric's. */
export const isUsed = (
  model: PanelModel,
  pill: PanelPill,
  dimension: PillDimension,
) => model.mapped.some((mapped) => mapped.picks[pill.id]?.id === dimension.id);

// ── The author's changes ──

const without = <T>(list: T[], item: T) =>
  list.filter((other) => other !== item);

/** Takes a dimension out of the metric. One made by hand is gone for good. */
export function removeDimension(
  mapping: PanelMapping,
  { id, origin }: MetricDimension,
): PanelMapping {
  if (origin === "custom") {
    const { [id]: _picks, ...picks } = mapping.picks;
    const { [id]: _name, ...names } = mapping.names;
    return { ...mapping, added: without(mapping.added, id), picks, names };
  }
  return origin === "semantic"
    ? { ...mapping, confirmed: without(mapping.confirmed, id) }
    : { ...mapping, removed: [...mapping.removed, id] };
}

/** Puts a suggested or removed dimension in the metric. */
export const mapDimension = (
  mapping: PanelMapping,
  { id, origin }: MetricDimension,
): PanelMapping =>
  origin === "semantic"
    ? { ...mapping, confirmed: [...mapping.confirmed, id] }
    : { ...mapping, removed: without(mapping.removed, id) };

export const renameDimension = (
  mapping: PanelMapping,
  id: string,
  name: string,
): PanelMapping => ({ ...mapping, names: { ...mapping.names, [id]: name } });

/** Chooses the field one pill reads for a dimension, keeping the others. */
export function pickField(
  mapping: PanelMapping,
  dimension: MetricDimension,
  pillId: string,
  pillDimensionId: string,
): PanelMapping {
  const current = Object.fromEntries(
    Object.entries(dimension.picks).map(([id, pick]) => [id, pick.id]),
  );
  return {
    ...mapping,
    picks: {
      ...mapping.picks,
      [dimension.id]: { ...current, [pillId]: pillDimensionId },
    },
  };
}

/** Starts a dimension made by hand, with one field filled in if given. */
export function addDimension(
  mapping: PanelMapping,
  seed?: { pillId: string; pillDimensionId: string },
): { mapping: PanelMapping; id: string } {
  const taken = mapping.added.map((id) => Number(id.split(":")[1]));
  const id = `custom:${Math.max(0, ...taken) + 1}`;
  return {
    id,
    mapping: {
      ...mapping,
      added: [...mapping.added, id],
      picks: {
        ...mapping.picks,
        [id]: seed ? { [seed.pillId]: seed.pillDimensionId } : {},
      },
    },
  };
}

// ── What the typed filter bar can follow ──

const isColumn = (column: ColumnSpec, field: Field) =>
  field.column.toLowerCase() === column.column.toLowerCase() &&
  (column.via == null
    ? field.group == null
    : field.group?.toLowerCase() === column.via.toLowerCase());

/**
 * The filter bar still reads the scripted columns, so this says which of its
 * dimensions the real ones cover: a filter on a dimension the author removed
 * here is then an error there.
 */
export function scriptedMapping(
  model: PanelModel,
  draft: MetricDraft,
  resolver: Resolver,
): DimensionMapping {
  if (model.isLoading || model.pills.length === 0) {
    return draft.mapping;
  }
  const tableOf = (sourceId: string) => {
    const leaf = resolver.leaf(sourceId);
    return leaf ? tablesOf(leaf)[0] : undefined;
  };
  const isCovered = (scripted: Dimension) =>
    model.mapped.some((dimension) => {
      const fields = Object.values(dimension.targets);
      return (
        fields.length > 0 &&
        fields.every((field) => {
          const table = tableOf(field.sourceId);
          const column = scripted.columns.find((c) => c.table === table);
          return column != null && isColumn(column, field);
        })
      );
    });
  const base = combineDimensions(pillsOf(draft, resolver), EMPTY_MAPPING);
  return {
    confirmed: base.suggested.filter(isCovered).map(({ id }) => id),
    removed: base.mapped
      .filter((scripted) => !isCovered(scripted))
      .map(({ id }) => id),
  };
}

/** The values two hand-mapped text fields have in common, where known. */
export function valueOverlap(
  dimension: MetricDimension,
): { common: number; total: number } | null {
  const fields = Object.values(dimension.targets);
  if (dimension.type !== "category" || !dimension.differs) {
    return null;
  }
  const lists = fields.map(
    (field) => COLUMNS.find((column) => isColumn(column, field))?.values,
  );
  const known = lists.flatMap((values) => (values ? [values] : []));
  if (known.length < 2 || known.length < lists.length) {
    return null;
  }
  const total = new Set(known.flat()).size;
  const common = known[0].filter((value) =>
    known.every((values) => values.includes(value)),
  ).length;
  return { common, total };
}
