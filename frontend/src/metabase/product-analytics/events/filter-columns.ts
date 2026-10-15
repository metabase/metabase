import * as Lib from "metabase-lib";

import { readEventQuery } from "./read-event-query";
import type { EventDefinition } from "./types";

const STAGE = -1;

const columnNamesIn = (
  query: Lib.Query,
  node: Lib.ExpressionParts | Lib.ExpressionArg,
): string[] => {
  if (Lib.isColumnMetadata(node)) {
    return [Lib.displayInfo(query, STAGE, node).name];
  }
  return Lib.isExpressionParts(node)
    ? node.args.flatMap((arg) => columnNamesIn(query, arg))
    : [];
};

/**
 * `Lib.expressionParts` only returns parts for an operator clause. A filter
 * that is just a reference, like a segment or a boolean column, comes back as
 * that reference's metadata.
 */
const expressionTree = (
  query: Lib.Query,
  filter: Lib.FilterClause,
): Lib.ExpressionParts | Lib.ExpressionArg =>
  Lib.expressionParts(query, STAGE, filter);

/**
 * Names of the columns the event's filters read. Columns inside a segment
 * aren't included, since only the segment is referenced.
 */
export const getEventFilterColumns = (
  metadataProvider: Lib.MetadataProvider,
  event: EventDefinition,
): string[] => {
  const query = readEventQuery(metadataProvider, event);
  if (query === null) {
    return [];
  }
  return Lib.filters(query, STAGE).flatMap((filter) =>
    columnNamesIn(query, expressionTree(query, filter)),
  );
};
