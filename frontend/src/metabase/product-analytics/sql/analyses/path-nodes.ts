import { t } from "ttag";

import type { PathNodeKind, PathsColumns } from "metabase/viz-core";

import type { AnalysisSpec } from "../../spec/types";
import { lit } from "../compile/dialect";
import { flagSql } from "../compile/flag";

/** The columns the paths chart reads beside source, target and weight. */
export const PATHS_COLUMNS: PathsColumns = {
  sourceLabel: "source_label",
  targetLabel: "target_label",
  targetKind: "target_kind",
};

/** What a step is called: a pageview's URL path, or any other event's name. */
export const stepNameSql = ({ pageview }: AnalysisSpec): string => {
  const eventName = "ifNull(event_name, '')";
  return pageview !== undefined
    ? `if(${flagSql(pageview.flag)}, url_path, ${eventName})`
    : eventName;
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
