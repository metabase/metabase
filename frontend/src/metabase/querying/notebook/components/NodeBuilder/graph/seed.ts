// Builds a graph from an existing query.

import * as Lib from "metabase-lib";

import type { BuilderEdge, BuilderNode } from "../types";

import { RESULT_NODE_ID, STAGE_INDEX } from "./constants";
import { createEdge } from "./edges";
import {
  ORIGIN,
  createExpressionNode,
  createFilterNode,
  createJoinNode,
  createLimitNode,
  createResultNode,
  createSortNode,
  createSummarizeNode,
  createTableNode,
} from "./nodes";
import { excludedNames, summarizeColumns } from "./sources";

// Builds the canvas for an existing question, so what the notebook already
// has shows up wired and ready to edit. The result block is always there.
export function seedGraph(rawQuery: Lib.Query): {
  nodes: BuilderNode[];
  edges: BuilderEdge[];
} {
  const query = Lib.dropEmptyStages(rawQuery);
  const result = createResultNode();
  const sourceId = Lib.sourceTableOrCardId(query);
  const databaseId = Lib.databaseID(query);
  const sourceTable =
    sourceId != null ? Lib.tableOrCardMetadata(query, sourceId) : null;
  if (!sourceTable || databaseId == null) {
    return { nodes: [result], edges: [] };
  }

  const nodes: BuilderNode[] = [];
  const edges: BuilderEdge[] = [];
  const sourceColumns = Lib.fieldableColumns(query, STAGE_INDEX).filter(
    (column) => {
      const info = Lib.displayInfo(query, STAGE_INDEX, column);
      return !info.isFromJoin && !info.isImplicitlyJoinable;
    },
  );
  const source = createTableNode(
    ORIGIN,
    {
      table: sourceTable,
      databaseId,
      tableName: Lib.displayInfo(query, STAGE_INDEX, sourceTable).displayName,
      columns: summarizeColumns(query, sourceColumns),
    },
    excludedNames(query, sourceColumns),
  );
  nodes.push(source);

  let prevId = source.id;
  Lib.joins(query, STAGE_INDEX).forEach((join) => {
    const joinedTable = Lib.joinedThing(query, join);
    const joinedColumns = Lib.joinableColumns(query, STAGE_INDEX, join);
    const tableNode = createTableNode(
      ORIGIN,
      {
        table: joinedTable,
        databaseId,
        tableName: Lib.displayInfo(query, STAGE_INDEX, joinedTable).displayName,
        columns: summarizeColumns(query, joinedColumns),
      },
      excludedNames(query, joinedColumns),
    );
    const joinNode = createJoinNode(
      ORIGIN,
      Lib.joinStrategy(join),
      Lib.joinConditions(join),
      join,
    );
    nodes.push(tableNode, joinNode);
    edges.push(
      createEdge({
        source: prevId,
        sourceHandle: "out",
        target: joinNode.id,
        targetHandle: "lhs",
      }),
      createEdge({
        source: tableNode.id,
        sourceHandle: "out",
        target: joinNode.id,
        targetHandle: "rhs",
      }),
    );
    prevId = joinNode.id;
  });

  const append = (node: BuilderNode) => {
    nodes.push(node);
    edges.push(
      createEdge({
        source: prevId,
        sourceHandle: "out",
        target: node.id,
        targetHandle: "in",
      }),
    );
    prevId = node.id;
  };

  // Stage 0 filters are free blocks in the chain; from the next stage on a
  // filter works on a summarize's results and sits in the ladder after it.
  Lib.stageIndexes(query).forEach((stageIndex) => {
    if (stageIndex > 0) {
      Lib.joins(query, stageIndex).forEach((join) => {
        const joinedTable = Lib.joinedThing(query, join);
        const joinedColumns = Lib.joinableColumns(query, stageIndex, join);
        const tableNode = createTableNode(
          ORIGIN,
          {
            table: joinedTable,
            databaseId,
            tableName: Lib.displayInfo(query, stageIndex, joinedTable)
              .displayName,
            columns: summarizeColumns(query, joinedColumns, stageIndex),
          },
          excludedNames(query, joinedColumns, stageIndex),
        );
        const joinNode = createJoinNode(
          ORIGIN,
          Lib.joinStrategy(join),
          Lib.joinConditions(join),
          join,
          true,
        );
        nodes.push(tableNode, joinNode);
        edges.push(
          createEdge({
            source: prevId,
            sourceHandle: "out",
            target: joinNode.id,
            targetHandle: "lhs",
          }),
          createEdge({
            source: tableNode.id,
            sourceHandle: "out",
            target: joinNode.id,
            targetHandle: "rhs",
          }),
        );
        prevId = joinNode.id;
      });
    }
    const expressions = Lib.expressions(query, stageIndex).map((clause) => ({
      name: Lib.displayInfo(query, stageIndex, clause).displayName,
      clause,
    }));
    if (expressions.length > 0) {
      append(createExpressionNode(ORIGIN, expressions, stageIndex > 0));
    }
    const filters = Lib.filters(query, stageIndex);
    if (filters.length > 0) {
      append(createFilterNode(ORIGIN, filters, stageIndex > 0));
    }
    const aggregations = Lib.aggregations(query, stageIndex);
    const breakoutColumns = Lib.breakouts(query, stageIndex)
      .map((breakout) => Lib.breakoutColumn(query, stageIndex, breakout))
      .filter((column): column is Lib.ColumnMetadata => column != null);
    if (aggregations.length > 0 || breakoutColumns.length > 0) {
      append(createSummarizeNode(ORIGIN, aggregations, breakoutColumns));
    }
    const orderBys = Lib.orderBys(query, stageIndex);
    if (orderBys.length > 0) {
      append(createSortNode(ORIGIN, orderBys));
    }
    const limit = Lib.currentLimit(query, stageIndex);
    if (typeof limit === "number") {
      append(createLimitNode(ORIGIN, limit));
    }
  });

  nodes.push(result);
  edges.push(
    createEdge({
      source: prevId,
      sourceHandle: "out",
      target: RESULT_NODE_ID,
      targetHandle: "in",
    }),
  );
  return { nodes, edges };
}
