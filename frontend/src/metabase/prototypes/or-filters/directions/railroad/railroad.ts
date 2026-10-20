import * as Lib from "metabase-lib";

import { isExpressionParts, toFilterClause } from "../../harness/clauses";
import { clearFilters } from "../../harness/examples";

/**
 * The stage's filters as a railroad: series = AND, parallel = OR. The root is
 * an AND whose children are the stage's top-level filters; an OR's branches
 * are ANDs. After `normalize` no AND sits directly in an AND, no OR directly
 * in an OR, and an OR always has at least two branches.
 */
export type CondNode = { type: "cond"; clause: Lib.FilterClause };
export type AndNode = { type: "and"; children: AndChild[] };
export type OrNode = { type: "or"; branches: AndNode[] };
export type AndChild = CondNode | OrNode;
export type RailNode = CondNode | AndNode | OrNode;

/** Indices from the root: into an AND's children, then an OR's branches, and so on. */
export type NodePath = number[];

export const ROOT_PATH: NodePath = [];

const cond = (clause: Lib.FilterClause): CondNode => ({ type: "cond", clause });
const and = (children: AndChild[]): AndNode => ({ type: "and", children });
const or = (branches: AndNode[]): OrNode => ({ type: "or", branches });

export function readRailTree(query: Lib.Query, stageIndex: number): AndNode {
  const readClause = (arg: Lib.ExpressionArg | Lib.ExpressionParts) =>
    toFilterClause(query, stageIndex, Lib.expressionClause(arg));

  const readAndChildren = (
    arg: Lib.ExpressionArg | Lib.ExpressionParts,
  ): AndChild[] => {
    if (isExpressionParts(arg) && arg.operator === "and") {
      return arg.args.flatMap(readAndChildren);
    }
    if (isExpressionParts(arg) && arg.operator === "or") {
      return [or(arg.args.flatMap(readBranches))];
    }
    return [cond(readClause(arg))];
  };

  const readBranches = (
    arg: Lib.ExpressionArg | Lib.ExpressionParts,
  ): AndNode[] => {
    if (isExpressionParts(arg) && arg.operator === "or") {
      return arg.args.flatMap(readBranches);
    }
    return [and(readAndChildren(arg))];
  };

  const children = Lib.filters(query, stageIndex).flatMap((filter) => {
    const parts = Lib.expressionParts(query, stageIndex, filter);
    const isCompound = parts.operator === "and" || parts.operator === "or";
    return isCompound ? readAndChildren(parts) : [cond(filter)];
  });
  return normalize(and(children));
}

function toClause(node: RailNode): Lib.Filterable {
  switch (node.type) {
    case "cond":
      return node.clause;
    case "and":
      return node.children.length === 1
        ? toClause(node.children[0])
        : Lib.expressionClause("and", node.children.map(toClause));
    case "or":
      return Lib.expressionClause("or", node.branches.map(toClause));
  }
}

/** Replaces the stage's filters with the tree's top-level children. */
export function writeRailTree(
  query: Lib.Query,
  stageIndex: number,
  root: AndNode,
): Lib.Query {
  return normalize(root).children.reduce(
    (nextQuery, child) => Lib.filter(nextQuery, stageIndex, toClause(child)),
    clearFilters(query, stageIndex),
  );
}

function normalizeAndChildren(children: AndChild[]): AndChild[] {
  return children.flatMap((child) => {
    if (child.type === "cond") {
      return [child];
    }
    const branches = child.branches
      .map((branch) => normalizeAndChildren(branch.children))
      .flatMap((branchChildren) => {
        const [only] = branchChildren;
        const isLoneOr = branchChildren.length === 1 && only?.type === "or";
        return isLoneOr ? only.branches : [and(branchChildren)];
      })
      .filter((branch) => branch.children.length > 0);
    if (branches.length === 0) {
      return [];
    }
    return branches.length === 1 ? branches[0].children : [or(branches)];
  });
}

export function normalize(root: AndNode): AndNode {
  return and(normalizeAndChildren(root.children));
}

export function getNode(root: AndNode, path: NodePath): RailNode | undefined {
  return path.reduce<RailNode | undefined>((node, index) => {
    switch (node?.type) {
      case "and":
        return node.children[index];
      case "or":
        return node.branches[index];
      default:
        return undefined;
    }
  }, root);
}

function updateChildren<T>(items: T[], index: number, update: (item: T) => T) {
  return items.map((item, i) => (i === index ? update(item) : item));
}

function updateAt(
  node: RailNode,
  path: NodePath,
  update: (node: RailNode) => RailNode,
): RailNode {
  const [index, ...rest] = path;
  if (index === undefined) {
    return update(node);
  }
  const step = (child: RailNode) => updateAt(child, rest, update);
  switch (node.type) {
    case "and":
      return and(
        updateChildren(node.children, index, (child) =>
          asAndChild(step(child)),
        ),
      );
    case "or":
      return or(
        updateChildren(node.branches, index, (branch) =>
          asAndNode(step(branch)),
        ),
      );
    case "cond":
      return node;
  }
}

function asAndChild(node: RailNode): AndChild {
  return node.type === "and" ? or([node]) : node;
}

function asAndNode(node: RailNode): AndNode {
  return node.type === "and" ? node : and([node]);
}

function updateRoot(
  root: AndNode,
  path: NodePath,
  update: (node: RailNode) => RailNode,
): AndNode {
  return normalize(asAndNode(updateAt(root, path, update)));
}

function updateParent(
  root: AndNode,
  path: NodePath,
  update: (parent: RailNode, index: number) => RailNode,
): AndNode {
  const parentPath = path.slice(0, -1);
  const index = path[path.length - 1];
  return index === undefined
    ? root
    : updateRoot(root, parentPath, (parent) => update(parent, index));
}

export function removeAt(root: AndNode, path: NodePath): AndNode {
  return updateParent(root, path, (parent, index) => {
    switch (parent.type) {
      case "and":
        return and(parent.children.filter((_child, i) => i !== index));
      case "or":
        return or(parent.branches.filter((_branch, i) => i !== index));
      case "cond":
        return parent;
    }
  });
}

export function replaceAt(
  root: AndNode,
  path: NodePath,
  clause: Lib.FilterClause,
): AndNode {
  return updateRoot(root, path, () => cond(clause));
}

/** Adds `clause` in series at `index` of the AND at `andPath`. */
export function insertInSeries(
  root: AndNode,
  andPath: NodePath,
  index: number,
  clause: Lib.FilterClause,
): AndNode {
  return updateRoot(root, andPath, (node) =>
    node.type === "and"
      ? and([
          ...node.children.slice(0, index),
          cond(clause),
          ...node.children.slice(index),
        ])
      : node,
  );
}

/** Forks the node at `path` into `or(node, clause)`. */
export function addAlternative(
  root: AndNode,
  path: NodePath,
  clause: Lib.FilterClause,
): AndNode {
  return updateRoot(root, path, (node) =>
    or([asAndNode(node), and([cond(clause)])]),
  );
}

export function addBranch(
  root: AndNode,
  orPath: NodePath,
  clause: Lib.FilterClause,
): AndNode {
  return updateRoot(root, orPath, (node) =>
    node.type === "or" ? or([...node.branches, and([cond(clause)])]) : node,
  );
}

/** Adds a whole new OR row under everything that is there now. */
export function addRow(root: AndNode, clause: Lib.FilterClause): AndNode {
  const [only] = root.children;
  const isSingleOr = root.children.length === 1 && only?.type === "or";
  if (root.children.length === 0) {
    return and([cond(clause)]);
  }
  if (isSingleOr) {
    return addBranch(root, [0], clause);
  }
  return normalize(and([or([and(root.children), and([cond(clause)])])]));
}
