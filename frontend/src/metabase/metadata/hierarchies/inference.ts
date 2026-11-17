import { t } from "ttag";
import _ from "underscore";

import { singularize } from "metabase/utils/formatting";
import type { Field, FieldId, Table } from "metabase-types/api";

import {
  DEFAULT_HIERARCHY_OPTIONS,
  type Hierarchy,
  type HierarchyKind,
  type HierarchyLevel,
  getLeafDisplay,
} from "./hierarchies";

/** A hierarchy sync would create, until an admin accepts or dismisses it */
export type HierarchyProposal = {
  /** Stable across reloads, so a resolved proposal stays resolved */
  key: string;
  name: string;
  kind: HierarchyKind;
  levels: HierarchyLevel[];
  parentKeyFieldId?: FieldId;
  depthFieldId?: FieldId;
  pathFieldId?: FieldId;
  /** Why sync proposes it */
  signal: string;
};

type LocationLevel = {
  semanticType?: string;
  /** The level's word at the end of a column name, after an optional prefix */
  pattern: RegExp;
};

// Top first. Prefixes like billing_ and shipping_ make separate hierarchies.
const LOCATION_LEVELS: LocationLevel[] = [
  {
    semanticType: "type/Country",
    pattern: /^(.*?)(country)(_name|_code)?$/,
  },
  {
    semanticType: "type/State",
    pattern: /^(.*?)(state|province|region)(_name|_code)?$/,
  },
  { pattern: /^(.*?)(county)(_name)?$/ },
  { semanticType: "type/City", pattern: /^(.*?)(city)(_name)?$/ },
];

const LEVEL_COLUMN_RE = /^(.*?)_?level_?(\d+)(_.*)?$/;
const PARENT_KEY_NAME_RE = /^(parent|manager|reports_to|parent_[a-z]+)(_id)?$/;
const DEPTH_NAME_RE = /^(depth|level|hierarchy_level|tree_level)$/;
const PATH_NAME_RE = /(^|_)path$/;

const nameOf = (field: Field) => field.name.toLowerCase();

/** "billing_" → "Billing" */
const humanizePrefix = (prefix: string) => {
  const words = prefix.replace(/_+$/, "").split("_").filter(Boolean);
  const text = words.join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
};

function getLocationProposals(fields: Field[]): HierarchyProposal[] {
  // prefix → one field per level, top first
  const byPrefix = new Map<string, (Field | undefined)[]>();
  fields.forEach((field) => {
    LOCATION_LEVELS.forEach((level, index) => {
      const match = level.pattern.exec(nameOf(field));
      const isTyped =
        level.semanticType != null &&
        field.semantic_type === level.semanticType;
      if (!match && !isTyped) {
        return;
      }
      const prefix = match ? match[1] : "";
      const slots = byPrefix.get(prefix) ?? [];
      // A column typed for the level wins over one only named like it
      if (slots[index] == null || isTyped) {
        slots[index] = field;
      }
      byPrefix.set(prefix, slots);
    });
  });
  return [...byPrefix.entries()].flatMap(([prefix, slots]) => {
    const levelFields = slots.filter((field): field is Field => field != null);
    if (levelFields.length < 2) {
      return [];
    }
    return [
      {
        key: `location:${prefix}`,
        name: prefix ? t`${humanizePrefix(prefix)} location` : t`Location`,
        kind: "fixed",
        levels: levelFields.map(({ id }) => ({ fieldId: id })),
        signal: t`${levelFields.map(({ display_name }) => display_name).join(", ")} are location columns`,
      },
    ];
  });
}

function getLevelColumnProposals(fields: Field[]): HierarchyProposal[] {
  const groups = _.groupBy(
    fields.flatMap((field) => {
      const match = LEVEL_COLUMN_RE.exec(nameOf(field));
      return match
        ? [{ field, prefix: match[1], level: Number(match[2]) }]
        : [];
    }),
    ({ prefix }) => prefix,
  );
  return Object.entries(groups).flatMap(([prefix, columns]) => {
    if (columns.length < 2) {
      return [];
    }
    const ordered = _.sortBy(columns, ({ level }) => level);
    return [
      {
        key: `levels:${prefix}`,
        name: prefix ? humanizePrefix(prefix) : t`Levels`,
        kind: "fixed",
        levels: ordered.map(({ field }) => ({ fieldId: field.id })),
        signal: t`${ordered.map(({ field }) => field.display_name).join(", ")} are numbered levels`,
      },
    ];
  });
}

function getRecursiveProposals(
  table: Pick<Table, "id" | "display_name">,
  fields: Field[],
): HierarchyProposal[] {
  const depthField = fields.find((field) => DEPTH_NAME_RE.test(nameOf(field)));
  const pathField = fields.find((field) => PATH_NAME_RE.test(nameOf(field)));
  return fields.flatMap((field): HierarchyProposal[] => {
    const isSelfKey = field.target?.table_id === table.id;
    if (!isSelfKey && !PARENT_KEY_NAME_RE.test(nameOf(field))) {
      return [];
    }
    const isManager = /manager|reports_to/.test(nameOf(field));
    return [
      {
        key: `recursive:${field.id}`,
        name: isManager
          ? t`Org tree`
          : t`${singularize(table.display_name)} tree`,
        kind: "recursive",
        levels: [],
        parentKeyFieldId: field.id,
        depthFieldId: depthField?.id,
        pathFieldId: pathField?.id,
        signal: isSelfKey
          ? t`${field.display_name} points to a row in this table`
          : t`${field.display_name} is named like a parent key`,
      },
    ];
  });
}

const getLevelIds = (levels: HierarchyLevel[]) =>
  levels.map(({ fieldId, viaFieldId }) => `${viaFieldId ?? ""}:${fieldId}`);

/** Whether a hierarchy already covers what the proposal would create */
const isCoveredBy = (proposal: HierarchyProposal, hierarchy: Hierarchy) =>
  proposal.kind === "recursive"
    ? hierarchy.parentKeyFieldId === proposal.parentKeyFieldId
    : _.isEqual(
        getLevelIds(hierarchy.levels).sort(),
        getLevelIds(proposal.levels).sort(),
      );

/**
 * PROTOTYPE: mocked. What sync finds, per doc 06: a Location hierarchy from
 * country, state, county and city columns, one from numbered level columns,
 * and a tree for each column that points to a parent row. Sync creates these;
 * ones already saved, or deleted, don't come back.
 */
export function getHierarchyProposals(
  table: Pick<Table, "id" | "display_name">,
  fields: Field[],
  hierarchies: Hierarchy[],
  resolvedKeys: string[],
): HierarchyProposal[] {
  return [
    ...getLocationProposals(fields),
    ...getLevelColumnProposals(fields),
    ...getRecursiveProposals(table, fields),
  ].filter(
    (proposal) =>
      !resolvedKeys.includes(proposal.key) &&
      !hierarchies.some(
        (hierarchy) =>
          hierarchy.syncKey === proposal.key ||
          isCoveredBy(proposal, hierarchy),
      ),
  );
}

/** A sync hierarchy's id, stable across reloads so its page has a URL */
const getSyncHierarchyId = (key: string) =>
  `sync-${key.replace(/[^a-z0-9_-]/gi, "-")}`;

/** The hierarchy sync makes from what it found, with the default options */
export const getProposalHierarchy = (
  proposal: HierarchyProposal,
): Hierarchy => ({
  id: getSyncHierarchyId(proposal.key),
  name: proposal.name,
  kind: proposal.kind,
  levels: proposal.levels,
  parentKeyFieldId: proposal.parentKeyFieldId,
  depthFieldId: proposal.depthFieldId,
  pathFieldId: proposal.pathFieldId,
  ...DEFAULT_HIERARCHY_OPTIONS,
  leafDisplay: getLeafDisplay(
    proposal.kind,
    DEFAULT_HIERARCHY_OPTIONS.leafDisplay,
  ),
  source: "sync",
  syncKey: proposal.key,
});
