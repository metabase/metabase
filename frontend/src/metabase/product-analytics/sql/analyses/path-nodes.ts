import { t } from "ttag";

import type { PathNodeKind, PathsColumns } from "metabase/viz-core";

import type { AnalysisSpec } from "../../spec/types";
import { lit } from "../compile/dialect";

/** The columns the paths chart reads beside source, target and weight. */
export const PATHS_COLUMNS: PathsColumns = {
  sourceLabel: "source_label",
  targetLabel: "target_label",
  targetKind: "target_kind",
};

/** 1 on the events the table's pageview rule matches, 0 on the rest. */
export const PAGEVIEW_FLAG = "is_pageview";

const URL_PATH_SQL = "ifNull(url_path, '')";
const EVENT_NAME_SQL = "ifNull(event_name, '')";

/** What a step is called. See `PathsSpec["stepNames"]`. */
export const stepNameSql = ({ paths }: AnalysisSpec): string => {
  switch (paths?.stepNames) {
    case "url_path":
      return URL_PATH_SQL;
    case "url_path_on_pageviews":
      return `if(${PAGEVIEW_FLAG} = 1, ${URL_PATH_SQL}, ${EVENT_NAME_SQL})`;
    case "event_name":
    case undefined:
      return EVENT_NAME_SQL;
  }
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

/** The text shown for a node. */
export const pathNodeLabelSql = (kind: string, name: string): string =>
  [
    "multiIf(",
    `${kind} = ${kindSql("other")}, ${lit(t`(Other)`)}, `,
    `${kind} = ${kindSql("dropped")}, ${lit(t`(Dropped off)`)}, `,
    `${name})`,
  ].join("");
