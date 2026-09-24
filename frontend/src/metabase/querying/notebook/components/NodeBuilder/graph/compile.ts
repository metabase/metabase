// Turns the wired graph into an MLv2 query, one block at a time.

import { t } from "ttag";

import * as Lib from "metabase-lib";
import type { DatabaseId } from "metabase-types/api";

import { getDefaultJoinStrategy } from "../../JoinStep/JoinDraft/utils";
import type { BuilderEdge, BuilderNode, TableFlowNode } from "../types";

import { RESULT_NODE_ID, STAGE_INDEX } from "./constants";
import {
  isExpressionNode,
  isFilterNode,
  isJoinNode,
  isSortNode,
  isSummarizeNode,
  isTableNode,
  isUtilityNode,
  startsNextStage,
} from "./nodes";

// The query as it stands right after a utility block, and where that block's
// own clauses start in each clause list (everything before came from
// upstream blocks). Lets a block edit only what it owns.
export type StageInfo = {
  query: Lib.Query;
  // The stage of the query this block's clauses live on.
  stageIndex: number;
  expressionStart: number;
  filterStart: number;
  aggregationStart: number;
  breakoutStart: number;
  orderByStart: number;
};

// Where a join sits in the compiled query, with the chain's query right
// after it, so the block can read it even off the result's path.
export type JoinRef = {
  query: Lib.Query;
  stageIndex: number;
  joinIndex: number;
};

export type CompiledGraph = {
  // Null while nothing complete feeds the result.
  query: Lib.Query | null;
  stagesByNodeId: Map<string, StageInfo>;
  sourceNodeId: string | null;
  // Join node id -> where its join sits in the compiled query.
  joinIndexByNodeId: Map<string, JoinRef>;
  // Table node id -> where the join it is the right side of sits.
  tableJoinIndexByNodeId: Map<string, JoinRef>;
  activeNodeIds: Set<string>;
  activeEdgeIds: Set<string>;
  error: string | null;
};

export const EMPTY_COMPILED_GRAPH: CompiledGraph = {
  query: null,
  stagesByNodeId: new Map(),
  sourceNodeId: null,
  joinIndexByNodeId: new Map(),
  tableJoinIndexByNodeId: new Map(),
  activeNodeIds: new Set(),
  activeEdgeIds: new Set(),
  error: null,
};

function keepColumns(
  query: Lib.Query,
  columns: Lib.ColumnMetadata[],
  excludedColumns: string[],
  stageIndex = STAGE_INDEX,
): Lib.ColumnMetadata[] {
  const excluded = new Set(excludedColumns);
  return columns.filter(
    (column) => !excluded.has(Lib.displayInfo(query, stageIndex, column).name),
  );
}

function applySourceExclusions(
  query: Lib.Query,
  excludedColumns: string[],
): Lib.Query {
  if (excludedColumns.length === 0) {
    return query;
  }
  const columns = Lib.fieldableColumns(query, STAGE_INDEX);
  const kept = keepColumns(query, columns, excludedColumns);
  return kept.length > 0 && kept.length < columns.length
    ? Lib.withFields(query, STAGE_INDEX, kept)
    : query;
}

function applyJoinExclusions(
  baseQuery: Lib.Query,
  join: Lib.Join,
  table: Lib.Joinable,
  excludedColumns: string[],
  stageIndex = STAGE_INDEX,
): Lib.Join {
  if (excludedColumns.length === 0) {
    return Lib.withJoinFields(join, "all");
  }
  const columns = Lib.joinableColumns(baseQuery, stageIndex, table);
  const kept = keepColumns(baseQuery, columns, excludedColumns, stageIndex);
  if (kept.length === 0) {
    return Lib.withJoinFields(join, "none");
  }
  if (kept.length === columns.length) {
    return Lib.withJoinFields(join, "all");
  }
  return Lib.withJoinFields(join, kept);
}

// Suggested FK conditions, or a first-column placeholder the user fixes on
// the node. `null` when not even that is possible.
function buildJoinConditions(
  query: Lib.Query,
  table: Lib.Joinable,
  stageIndex = STAGE_INDEX,
): Lib.JoinCondition[] | null {
  const suggested = Lib.suggestedJoinConditions(query, stageIndex, table);
  if (suggested.length > 0) {
    return suggested;
  }
  const lhs = Lib.joinConditionLHSColumns(query, stageIndex, table)[0];
  const rhs = Lib.joinConditionRHSColumns(query, stageIndex, table)[0];
  const operators = Lib.joinConditionOperators(query, stageIndex);
  const operator =
    operators.find(
      (candidate) =>
        Lib.displayInfo(query, stageIndex, candidate).shortName === "=",
    ) ?? operators[0];
  if (!lhs || !rhs || !operator) {
    return null;
  }
  return [Lib.joinConditionClause(operator, lhs, rhs)];
}

type Chain = {
  query: Lib.Query;
  joinCount: number;
  databaseId: DatabaseId;
  // The stage the chain is on, and whether that stage has a summarize yet.
  stageIndex: number;
  hasSummarize: boolean;
};

// Walks back from the result: a table is the source of a query, a join takes
// the chain on its left and a table on its right. That is the left-deep chain
// MBQL joins are, so it maps one to one.
export function compileGraph(
  nodes: BuilderNode[],
  edges: BuilderEdge[],
  getMetadataProvider: (databaseId: DatabaseId) => Lib.MetadataProvider,
): CompiledGraph {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const inputEdge = (target: string, handle: string) =>
    edges.find(
      (edge) => edge.target === target && edge.targetHandle === handle,
    );

  const resultEdge = inputEdge(RESULT_NODE_ID, "in");

  const joinIndexByNodeId = new Map<string, JoinRef>();
  const tableJoinIndexByNodeId = new Map<string, JoinRef>();
  const stagesByNodeId = new Map<string, StageInfo>();
  const resolved = new Map<string, Chain>();
  const activeNodeIds = new Set<string>();
  const activeEdgeIds = new Set<string>();
  const visiting = new Set<string>();
  let sourceNodeId: string | null = null;

  const pickedTable = (node: TableFlowNode) => {
    if (node.data.table == null || node.data.databaseId == null) {
      throw new Error(t`Pick a table for every table block first`);
    }
    return { table: node.data.table, databaseId: node.data.databaseId };
  };

  // A node is resolved once even when reached twice; the `visiting` set still
  // catches loops.
  const resolve = (nodeId: string): Chain => {
    const cached = resolved.get(nodeId);
    if (cached) {
      return cached;
    }
    if (visiting.has(nodeId)) {
      throw new Error(t`The graph loops back on itself`);
    }
    visiting.add(nodeId);
    try {
      const chain = resolveUncached(nodeId);
      resolved.set(nodeId, chain);
      return chain;
    } finally {
      visiting.delete(nodeId);
    }
  };

  const resolveUncached = (nodeId: string): Chain => {
    const node = nodesById.get(nodeId);
    if (!node) {
      throw new Error(t`A wire points at a missing block`);
    }
    if (isTableNode(node)) {
      const { table, databaseId } = pickedTable(node);
      const query = applySourceExclusions(
        Lib.queryFromTableOrCardMetadata(
          getMetadataProvider(databaseId),
          table,
        ),
        node.data.excludedColumns,
      );
      sourceNodeId = nodeId;
      activeNodeIds.add(nodeId);
      return {
        query,
        joinCount: 0,
        databaseId,
        stageIndex: 0,
        hasSummarize: false,
      };
    }
    if (isJoinNode(node)) {
      const lhsEdge = inputEdge(nodeId, "lhs");
      const rhsEdge = inputEdge(nodeId, "rhs");
      if (!lhsEdge || !rhsEdge) {
        throw new Error(t`A join needs both of its inputs connected`);
      }
      const base = resolve(lhsEdge.source);
      let baseQuery = base.query;
      let { stageIndex, hasSummarize, joinCount } = base;
      // Joining a summarize's results happens on the next stage.
      if (hasSummarize) {
        baseQuery = Lib.appendStage(baseQuery);
        stageIndex += 1;
        hasSummarize = false;
        joinCount = 0;
      }
      const rhsNode = nodesById.get(rhsEdge.source);
      if (!rhsNode || !isTableNode(rhsNode)) {
        throw new Error(t`The right input of a join must be a table`);
      }
      const { table, databaseId } = pickedTable(rhsNode);
      if (databaseId !== base.databaseId) {
        throw new Error(t`Joins must stay within one database`);
      }
      const strategy =
        node.data.strategy ?? getDefaultJoinStrategy(baseQuery, stageIndex);
      const conditions =
        node.data.conditions ??
        buildJoinConditions(baseQuery, table, stageIndex);
      if (!conditions || conditions.length === 0) {
        throw new Error(t`Could not find columns to join on`);
      }
      // A join loaded from the question keeps its clause, and so its alias, as long as it still joins the same table.
      const seeded = node.data.seededJoin;
      const keepsSeeded =
        seeded != null &&
        Lib.displayInfo(
          baseQuery,
          stageIndex,
          Lib.joinedThing(baseQuery, seeded),
        ).displayName === rhsNode.data.tableName;
      const draft = keepsSeeded
        ? Lib.withJoinConditions(
            Lib.withJoinStrategy(seeded, strategy),
            conditions,
          )
        : Lib.joinClause(table, conditions, strategy);
      const join = applyJoinExclusions(
        baseQuery,
        draft,
        table,
        rhsNode.data.excludedColumns,
        stageIndex,
      );
      const query = Lib.join(baseQuery, stageIndex, join);
      const ref = { query, stageIndex, joinIndex: joinCount };
      joinIndexByNodeId.set(nodeId, ref);
      tableJoinIndexByNodeId.set(rhsNode.id, ref);
      activeNodeIds.add(nodeId);
      activeNodeIds.add(rhsNode.id);
      activeEdgeIds.add(lhsEdge.id);
      activeEdgeIds.add(rhsEdge.id);
      return {
        ...base,
        query,
        joinCount: joinCount + 1,
        stageIndex,
        hasSummarize,
      };
    }
    if (isUtilityNode(node)) {
      const inEdge = inputEdge(nodeId, "in");
      if (!inEdge) {
        throw new Error(
          t`Wire something into every block on the way to the result`,
        );
      }
      const base = resolve(inEdge.source);
      let query = base.query;
      let { stageIndex, hasSummarize } = base;
      // Filtering or summarizing again after a summarize works on its
      // results: that is the next stage of the query.
      if (startsNextStage(node) && hasSummarize) {
        query = Lib.appendStage(query);
        stageIndex += 1;
        hasSummarize = false;
      }
      const starts = {
        stageIndex,
        expressionStart: Lib.expressions(query, stageIndex).length,
        filterStart: Lib.filters(query, stageIndex).length,
        aggregationStart: Lib.aggregations(query, stageIndex).length,
        breakoutStart: Lib.breakouts(query, stageIndex).length,
        orderByStart: Lib.orderBys(query, stageIndex).length,
      };
      if (isExpressionNode(node)) {
        node.data.expressions.forEach(({ name, clause }) => {
          try {
            query = Lib.expression(query, stageIndex, name, clause);
          } catch {
            // A column this expression used is gone; drop the expression.
          }
        });
      } else if (isFilterNode(node)) {
        node.data.filters.forEach((clause) => {
          try {
            query = Lib.filter(query, stageIndex, clause);
          } catch {
            // The column behind this clause is gone; drop the clause.
          }
        });
      } else if (isSummarizeNode(node)) {
        node.data.aggregations.forEach((clause) => {
          try {
            query = Lib.aggregate(query, stageIndex, clause);
          } catch {
            // Same: a stale clause is dropped rather than breaking the query.
          }
        });
        node.data.breakoutColumns.forEach((column) => {
          try {
            query = Lib.breakout(query, stageIndex, column);
          } catch {
            // Same.
          }
        });
      } else if (isSortNode(node)) {
        node.data.orderBys.forEach((clause) => {
          try {
            const next = Lib.orderBy(query, stageIndex, clause);
            // A sort on a removed metric or group still applies but no orderable column answers to it; drop it.
            const position = Lib.orderBys(next, stageIndex).length - 1;
            const isOrderable = Lib.orderableColumns(next, stageIndex).some(
              (column) =>
                Lib.displayInfo(next, stageIndex, column).orderByPosition ===
                position,
            );
            if (isOrderable) {
              query = next;
            }
          } catch {
            // Same.
          }
        });
      } else if (node.data.limit != null) {
        query = Lib.limit(query, stageIndex, node.data.limit);
      }
      if (isSummarizeNode(node)) {
        hasSummarize = true;
      }
      stagesByNodeId.set(nodeId, { query, ...starts });
      activeNodeIds.add(nodeId);
      activeEdgeIds.add(inEdge.id);
      return { ...base, query, stageIndex, hasSummarize };
    }
    throw new Error(
      t`The result can only take a table, a join, a custom column, a filter, a summarize, a sort or a limit`,
    );
  };

  let query: Lib.Query | null = null;
  let error: string | null = null;
  if (!resultEdge) {
    error = t`Connect a table or a join to the result`;
  } else {
    try {
      const chain = resolve(resultEdge.source);
      activeEdgeIds.add(resultEdge.id);
      activeNodeIds.add(RESULT_NODE_ID);
      query = chain.query;
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    }
  }

  // Blocks off the result's path still compile as far as their own inputs
  // reach, so they can be configured before they are wired on. They are not
  // active: only the result's chain lights up.
  const resultSourceNodeId = sourceNodeId;
  const activeNodes = new Set(activeNodeIds);
  const activeEdges = new Set(activeEdgeIds);
  nodes.forEach((node) => {
    if ((isJoinNode(node) || isUtilityNode(node)) && !resolved.has(node.id)) {
      try {
        resolve(node.id);
      } catch {
        // An input is missing or broken; the block stays a draft.
      }
    }
  });

  return {
    query,
    stagesByNodeId,
    sourceNodeId: query ? resultSourceNodeId : null,
    joinIndexByNodeId,
    tableJoinIndexByNodeId,
    activeNodeIds: query ? activeNodes : new Set<string>(),
    activeEdgeIds: query ? activeEdges : new Set<string>(),
    error,
  };
}
