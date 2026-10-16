import { t } from "ttag";

import type { PathNodeKind, PathsColumns } from "metabase/viz-core";

import { lit } from "../compile/dialect";

/** The columns the paths chart reads beside source, target and weight. */
export const PATHS_COLUMNS: PathsColumns = {
  sourceLabel: "source_label",
  targetLabel: "target_label",
  targetKind: "target_kind",
};

export const kindSql = (kind: PathNodeKind): string => lit(kind);

/**
 * A node's key: the position keeps a repeated event from looping back, and
 * the kind keeps an event apart from a grouped or terminal node.
 */
export const pathNodeKeySql = (
  position: string,
  kind: string,
  name: string,
): string =>
  `concat(toString(${position}), '. ', if(${kind} = ${kindSql("step")}, ${name}, concat('(', ${kind}, ')', if(${name} = '', '', concat(' ', ${name})))))`;

/** The text shown for a node. `moreLabel` names a "more" node, when there is one. */
export const pathNodeLabelSql = (
  kind: string,
  name: string,
  moreLabel?: string,
): string =>
  [
    "multiIf(",
    `${kind} = ${kindSql("other")}, ${lit(t`(Other)`)}, `,
    `${kind} = ${kindSql("dropped")}, ${lit(t`(Dropped off)`)}, `,
    moreLabel !== undefined
      ? `${kind} = ${kindSql("more")}, ${lit(moreLabel)}, `
      : "",
    `${name})`,
  ].join("");
