import * as Lib from "metabase-lib";
import type {
  DimensionId,
  FieldId,
  MetricDimension,
  MetricDimensionGroup,
  TemporalUnit,
} from "metabase-types/api";

import { getNewDimensionTitle } from "./utils";

/**
 * PROTOTYPE: an unsaved metric's dimensions, kept in the browser. The server
 * only curates dimensions for saved metrics, so a new metric's candidates
 * come from its query's breakout columns, and the picks are applied to the
 * server's list right after the metric is created (`applyDimensionsDraft`).
 */

/** A column the new metric could be broken out by */
export type DimensionCandidate = {
  /** Its `id` is the candidate key, the same before and after saving */
  dimension: MetricDimension;
  group: MetricDimensionGroup;
  sourceColumnLabel: string;
  temporalUnits: TemporalUnit[];
};

export type DimensionOverrides = Partial<
  Pick<
    MetricDimension,
    "display_name" | "description" | "default_temporal_unit"
  >
>;

/** The added dimensions in order, with edits; `null` means untouched */
export type DimensionsDraft = {
  keys: DimensionId[];
  overrides: Record<DimensionId, DimensionOverrides>;
  defaultKey: DimensionId | null;
};

const STAGE_INDEX = -1;

/**
 * Identifies a dimension by where it comes from, so a candidate and the
 * dimension the server creates for the same column match up. Two links to
 * the same table share a key; the prototype accepts that.
 */
export function getDimensionKey(
  groupType: MetricDimensionGroup["type"],
  fieldId: FieldId,
): DimensionId {
  return `${groupType}:${fieldId}`;
}

/** The server dimension's key, or `null` when it has no source field */
export function getSavedDimensionKey(
  dimension: MetricDimension,
): DimensionId | null {
  const fieldId = dimension.sources?.[0]?.["field-id"];
  return dimension.group != null && fieldId != null
    ? getDimensionKey(dimension.group.type, fieldId)
    : null;
}

/** Every breakout column of the query, grouped like the server groups them */
export function getDimensionCandidates(query: Lib.Query): DimensionCandidate[] {
  const columns = Lib.breakoutableColumns(query, STAGE_INDEX);
  const seenKeys = new Set<DimensionId>();

  return Lib.groupColumns(columns).flatMap((columnGroup) => {
    const groupInfo = Lib.displayInfo(query, STAGE_INDEX, columnGroup);
    const groupType: MetricDimensionGroup["type"] =
      groupInfo.isMainGroup || groupInfo.isSourceTable ? "main" : "connection";
    const group: MetricDimensionGroup = {
      id: `${groupType}:${groupInfo.displayName}`,
      type: groupType,
      display_name: groupInfo.displayName,
    };

    return Lib.getColumnsFromColumnGroup(columnGroup).flatMap(
      (column): DimensionCandidate[] => {
        const { fieldId } = Lib.fieldValuesSearchInfo(query, column);
        if (fieldId == null) {
          return [];
        }
        const key = getDimensionKey(groupType, fieldId);
        if (seenKeys.has(key)) {
          return [];
        }
        seenKeys.add(key);

        const columnInfo = Lib.displayInfo(query, STAGE_INDEX, column);
        return [
          {
            dimension: {
              id: key,
              name: columnInfo.name,
              display_name: columnInfo.displayName,
              description: columnInfo.description ?? null,
              effective_type: columnInfo.effectiveType,
              semantic_type: columnInfo.semanticType,
              group,
              sources: [{ type: "field", "field-id": fieldId }],
            },
            group,
            sourceColumnLabel:
              groupType === "main"
                ? columnInfo.displayName
                : `${group.display_name}.${columnInfo.displayName}`,
            temporalUnits: getTemporalUnits(query, column),
          },
        ];
      },
    );
  });
}

function getTemporalUnits(
  query: Lib.Query,
  column: Lib.ColumnMetadata,
): TemporalUnit[] {
  const allUnits = Lib.availableTemporalUnits();
  return Lib.availableTemporalBuckets(query, STAGE_INDEX, column).flatMap(
    (bucket) => {
      const { shortName, isTemporalExtraction } = Lib.displayInfo(
        query,
        STAGE_INDEX,
        bucket,
      );
      const unit = allUnits.find((unit) => unit === shortName);
      return unit != null && !isTemporalExtraction ? [unit] : [];
    },
  );
}

/** What saving seeds: the metric's own table columns, with no default */
export function getSeededDraft(
  candidates: DimensionCandidate[],
): DimensionsDraft {
  return {
    keys: candidates
      .filter((candidate) => candidate.group.type === "main")
      .map((candidate) => candidate.dimension.id),
    overrides: {},
    defaultKey: null,
  };
}

/** The draft's added dimensions, dropping picks the query no longer has */
export function getDraftDimensions(
  candidates: DimensionCandidate[],
  draft: DimensionsDraft,
): MetricDimension[] {
  const candidateByKey = new Map(
    candidates.map((candidate) => [candidate.dimension.id, candidate]),
  );
  return draft.keys.flatMap((key) => {
    const candidate = candidateByKey.get(key);
    return candidate
      ? [
          {
            ...candidate.dimension,
            ...draft.overrides[key],
            default: draft.defaultKey === key,
          },
        ]
      : [];
  });
}

/** Adds a candidate at the end, titled the way the server titles it */
export function addToDraft(
  draft: DimensionsDraft,
  candidate: DimensionCandidate,
): DimensionsDraft {
  const key = candidate.dimension.id;
  if (draft.keys.includes(key)) {
    return draft;
  }
  const title = getNewDimensionTitle(candidate.group, candidate.dimension);
  return {
    ...draft,
    keys: [...draft.keys, key],
    overrides:
      title !== candidate.dimension.display_name
        ? { ...draft.overrides, [key]: { display_name: title } }
        : draft.overrides,
  };
}

export function removeFromDraft(
  draft: DimensionsDraft,
  keys: DimensionId[],
): DimensionsDraft {
  return {
    keys: draft.keys.filter((key) => !keys.includes(key)),
    overrides: draft.overrides,
    defaultKey:
      draft.defaultKey != null && keys.includes(draft.defaultKey)
        ? null
        : draft.defaultKey,
  };
}

/** `keys` is the new order of the full list */
export function reorderDraft(
  draft: DimensionsDraft,
  keys: DimensionId[],
): DimensionsDraft {
  return { ...draft, keys };
}

export function updateInDraft(
  draft: DimensionsDraft,
  key: DimensionId,
  changes: DimensionOverrides,
): DimensionsDraft {
  return {
    ...draft,
    overrides: {
      ...draft.overrides,
      [key]: { ...draft.overrides[key], ...changes },
    },
  };
}

export function setDraftDefault(
  draft: DimensionsDraft,
  key: DimensionId | null,
): DimensionsDraft {
  return { ...draft, defaultKey: key };
}

/** Candidates not added yet, grouped and filtered by `search` */
export function getAddableGroups(
  candidates: DimensionCandidate[],
  draft: DimensionsDraft,
  search: string,
): { group: MetricDimensionGroup; dimensions: MetricDimension[] }[] {
  const addedKeys = new Set(draft.keys);
  const query = search.trim().toLowerCase();
  const groups = new Map<
    string,
    { group: MetricDimensionGroup; dimensions: MetricDimension[] }
  >();

  candidates.forEach(({ dimension, group }) => {
    if (
      addedKeys.has(dimension.id) ||
      (query !== "" && !dimension.display_name.toLowerCase().includes(query))
    ) {
      return;
    }
    const entry = groups.get(group.id) ?? { group, dimensions: [] };
    entry.dimensions.push(dimension);
    groups.set(group.id, entry);
  });

  return Array.from(groups.values());
}
