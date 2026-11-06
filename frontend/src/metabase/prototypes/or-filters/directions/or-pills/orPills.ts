import * as Lib from "metabase-lib";

import { isExpressionParts, toFilterClause } from "../../harness/clauses";

/**
 * One pill's conditions as a tree whose connectors alternate by depth: the
 * root joins its children by OR, those join theirs by AND, the next level by
 * OR again, and so on: `or(and(a, or(b, and(c, d))), …)`. The root's children
 * are always groups (the editor's rows), even when they hold one clause.
 * Pills themselves are the stage's top-level filters, which the query engine
 * ANDs together.
 */
export type ClauseNode = { type: "clause"; clause: Lib.FilterClause };
export type GroupNode = { type: "group"; children: PillNode[] };
export type PillNode = ClauseNode | GroupNode;
export type PillTree = GroupNode;

export type Operator = "and" | "or";

/** Child indices from the root down. `[]` is the root itself. */
export type PillPath = number[];

/** Where a picked clause goes: appended to a group, or as a new subgroup of one. */
export type AddTarget = { kind: "clause" | "subgroup"; groupPath: PillPath };

export function getOperator(depth: number): Operator {
  return depth % 2 === 0 ? "or" : "and";
}

export function readPillTree(
  query: Lib.Query,
  stageIndex: number,
  filter: Lib.FilterClause,
): PillTree {
  const parts = Lib.expressionParts(query, stageIndex, filter);
  const readClause = (arg: Lib.ExpressionArg | Lib.ExpressionParts) =>
    toFilterClause(query, stageIndex, Lib.expressionClause(arg));

  // A nested group with its parent's own operator cannot be expressed with
  // alternating levels, so it is flattened into the parent (same logic).
  const readChild = (
    arg: Lib.ExpressionArg | Lib.ExpressionParts,
    depth: number,
  ): PillNode[] => {
    if (!isExpressionParts(arg)) {
      return [{ type: "clause", clause: readClause(arg) }];
    }
    if (arg.operator === getOperator(depth)) {
      return [
        {
          type: "group",
          children: arg.args.flatMap((child) => readChild(child, depth + 1)),
        },
      ];
    }
    if (arg.operator === getOperator(depth - 1)) {
      return arg.args.flatMap((child) => readChild(child, depth));
    }
    return [{ type: "clause", clause: readClause(arg) }];
  };

  const rootArgs = parts.operator === "or" ? parts.args : [parts];
  const children =
    parts.operator === "or" || parts.operator === "and"
      ? rootArgs.flatMap((arg) => readChild(arg, 1))
      : [{ type: "clause" as const, clause: filter }];
  return { type: "group", children: children.map(asRow) };
}

function asRow(node: PillNode): GroupNode {
  return node.type === "group" ? node : { type: "group", children: [node] };
}

function toNodeClause(
  node: PillNode,
  depth: number,
): Lib.FilterClause | Lib.ExpressionClause | undefined {
  if (node.type === "clause") {
    return node.clause;
  }
  const clauses = node.children.flatMap((child) => {
    const clause = toNodeClause(child, depth + 1);
    return clause ? [clause] : [];
  });
  if (clauses.length === 0) {
    return undefined;
  }
  return clauses.length === 1
    ? clauses[0]
    : Lib.expressionClause(getOperator(depth), clauses);
}

/** Collapses the tree into one clause, or `undefined` when it holds none. */
export function toPillClause(tree: PillTree) {
  return toNodeClause(tree, 0);
}

/** Replaces `filter` with the clause built from `tree`, or removes it. */
export function writePillTree(
  query: Lib.Query,
  stageIndex: number,
  filter: Lib.FilterClause,
  tree: PillTree,
): Lib.Query {
  const clause = toPillClause(tree);
  return clause
    ? Lib.replaceClause(query, stageIndex, filter, clause)
    : Lib.removeClause(query, stageIndex, filter);
}

/**
 * Ungroups a pill completely: removes `filter` and adds every clause in the
 * tree, at any depth, as its own top-level filter. Top-level filters are
 * AND-ed, so this changes the query's logic.
 */
export function expandPillTree(
  query: Lib.Query,
  stageIndex: number,
  filter: Lib.FilterClause,
  tree: PillTree,
): Lib.Query {
  const withoutPill = Lib.removeClause(query, stageIndex, filter);
  return flattenPillTree(tree).reduce(
    (nextQuery, { clause }) => Lib.filter(nextQuery, stageIndex, clause),
    withoutPill,
  );
}

/** Every clause in reading order, each with the connector that precedes it. */
export function flattenPillTree(
  tree: PillTree,
): { connector: Operator; clause: Lib.FilterClause }[] {
  const collect = (
    group: GroupNode,
    depth: number,
    leadConnector: Operator,
  ): { connector: Operator; clause: Lib.FilterClause }[] =>
    group.children.flatMap((child, index) => {
      const connector = index > 0 ? getOperator(depth) : leadConnector;
      return child.type === "clause"
        ? [{ connector, clause: child.clause }]
        : collect(child, depth + 1, connector);
    });
  return collect(tree, 0, "or");
}

function updateGroup(
  group: GroupNode,
  path: PillPath,
  update: (children: PillNode[]) => PillNode[],
): GroupNode {
  const [index, ...rest] = path;
  const children =
    index === undefined
      ? update(group.children)
      : group.children.map((child, childIndex) =>
          childIndex === index && child.type === "group"
            ? updateGroup(child, rest, update)
            : child,
        );
  // Emptied groups disappear so no connector is left dangling.
  return {
    ...group,
    children: children.filter(
      (child) => child.type === "clause" || child.children.length > 0,
    ),
  };
}

export function addClause(
  tree: PillTree,
  target: AddTarget,
  clause: Lib.FilterClause,
): PillTree {
  const node: PillNode =
    target.kind === "clause"
      ? { type: "clause", clause }
      : { type: "group", children: [{ type: "clause", clause }] };
  return updateGroup(tree, target.groupPath, (children) => [...children, node]);
}

export function replaceClause(
  tree: PillTree,
  path: PillPath,
  clause: Lib.FilterClause,
): PillTree {
  const index = path.at(-1);
  return updateGroup(tree, path.slice(0, -1), (children) =>
    children.map((child, childIndex) =>
      childIndex === index ? { type: "clause", clause } : child,
    ),
  );
}

export function removeClause(tree: PillTree, path: PillPath): PillTree {
  const index = path.at(-1);
  return updateGroup(tree, path.slice(0, -1), (children) =>
    children.filter((_child, childIndex) => childIndex !== index),
  );
}

export function getClause(tree: PillTree, path: PillPath) {
  const node = path.reduce<PillNode | undefined>(
    (current, index) =>
      current?.type === "group" ? current.children[index] : undefined,
    tree,
  );
  return node?.type === "clause" ? node.clause : undefined;
}

/** Adds `payload`'s rows as new OR rows of `tree`. */
export function appendOrRows(tree: PillTree, payload: PillTree): PillTree {
  return { ...tree, children: [...tree.children, ...payload.children] };
}

/**
 * ANDs `payload` into row `rowIndex`: a one-row payload joins the row's
 * clauses, a multi-row payload becomes an OR subgroup of the row.
 */
export function appendToRow(
  tree: PillTree,
  rowIndex: number,
  payload: PillTree,
): PillTree {
  const [onlyRow, ...otherRows] = payload.children;
  const nodes: PillNode[] =
    onlyRow?.type === "group" && otherRows.length === 0
      ? onlyRow.children
      : [{ type: "group", children: payload.children }];
  return updateGroup(tree, [rowIndex], (children) => [...children, ...nodes]);
}

export function moveRow(tree: PillTree, from: number, to: number): PillTree {
  const children = [...tree.children];
  const [row] = children.splice(from, 1);
  children.splice(to, 0, row);
  return { ...tree, children };
}

/** A one-clause tree, the shape a single dragged condition travels in. */
export function toSingleClauseTree(clause: Lib.FilterClause): PillTree {
  return {
    type: "group",
    children: [{ type: "group", children: [{ type: "clause", clause }] }],
  };
}
