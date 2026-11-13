import { getMBQLName } from "metabase/querying/expressions";
import {
  ARG_LIST,
  BOOLEAN,
  CALL,
  END_OF_INPUT,
  FIELD,
  GROUP,
  GROUP_CLOSE,
  IDENTIFIER,
  NUMBER,
  type Node,
  ROOT,
  STRING,
  lexify,
  parse,
} from "metabase/querying/expressions/pratt";
import type { RowValue } from "metabase-types/api";

/**
 * A part of the expression: a literal like 100, a column, a group in
 * parentheses, or an operation like a function call or `a - b`.
 */
export type EvalNode = {
  id: number;
  kind: "literal" | "column" | "group" | "operation" | "case";
  from: number;
  to: number;
  children: EvalNode[];
};

/**
 * The parts of `source`, as a tree, or null when it has a syntax error. It
 * uses the parser of the compiler, which knows the precedence of operators.
 */
export function parseEvalTree(source: string): EvalNode | null {
  const tokens = lexify(source);
  let root: Node;
  try {
    root = parse(tokens);
  } catch {
    return null;
  }

  // The tree has the "(" of a group or call, but not the ")".
  const closeEnds = new Map<number, number>();
  const opens: number[] = [];
  for (const token of tokens) {
    if (token.type === GROUP) {
      opens.push(token.start);
    } else if (token.type === GROUP_CLOSE) {
      const start = opens.pop();
      if (start != null) {
        closeEnds.set(start, token.end);
      }
    }
  }

  let nextId = 0;
  const build = (node: Node): EvalNode | null => {
    if (node.type === ROOT) {
      return node.children[0] ? build(node.children[0]) : null;
    }
    const id = nextId++;
    const children = (
      node.type === CALL
        ? node.children[0]?.type === ARG_LIST
          ? node.children[0].children
          : node.children
        : node.children
    )
      .map(build)
      .filter((child): child is EvalNode => child != null);
    const range = getRange(node, closeEnds);
    const base = { id, ...range, children };
    switch (node.type) {
      case NUMBER:
      case STRING:
      case BOOLEAN:
        return { ...base, kind: "literal" };
      case FIELD:
      case IDENTIFIER:
        return { ...base, kind: "column" };
      case GROUP:
        return { ...base, kind: "group" };
      case CALL: {
        const operator = getMBQLName(node.token?.text.trim() ?? "");
        return {
          ...base,
          kind: operator === "case" || operator === "if" ? "case" : "operation",
        };
      }
      default:
        return { ...base, kind: "operation" };
    }
  };
  return build(root);
}

/** The text range of a node and its children, with the ")" of its groups. */
function getRange(
  node: Node,
  closeEnds: Map<number, number>,
): { from: number; to: number } {
  let from = Infinity;
  let to = -Infinity;
  const visit = (node: Node) => {
    const token = node.token;
    if (token != null && token.type !== END_OF_INPUT) {
      from = Math.min(from, token.start);
      to = Math.max(to, closeEnds.get(token.start) ?? token.end);
    }
    node.children.forEach(visit);
  };
  visit(node);
  return { from, to };
}

/** The parts that get a value from the database: columns and operations. */
export function getValueNodes(root: EvalNode): EvalNode[] {
  const nodes: EvalNode[] = [];
  const visit = (node: EvalNode) => {
    node.children.forEach(visit);
    if (node.kind !== "literal" && node.kind !== "group") {
      nodes.push(node);
    }
  };
  visit(root);
  return nodes;
}

export type Step = {
  /** The parts that show as their values. */
  evaluated: Set<number>;
  /** The part that got its value in this step: the result of the step. */
  result: number | null;
  /** The part that the next step evaluates. */
  next: number | null;
};

/**
 * The steps of the evaluation, like Excel's "Evaluate Formula": first the
 * values of the columns, then each operation from the inside out and from
 * left to right. A `case` evaluates its conditions in order, then only the
 * output of the first condition that is true.
 */
export function getSteps(
  root: EvalNode,
  values: Map<number, RowValue>,
): Step[] {
  const columns = getValueNodes(root).filter(
    (node) => node.kind === "column" && values.has(node.id),
  );
  const evaluated = new Set(columns.map((node) => node.id));
  const steps: Step[] = [
    { evaluated: new Set(evaluated), result: null, next: null },
  ];

  const evaluate = (node: EvalNode) => {
    if (!values.has(node.id) || evaluated.has(node.id)) {
      return;
    }
    evaluated.add(node.id);
    steps.push({ evaluated: new Set(evaluated), result: node.id, next: null });
  };

  const visit = (node: EvalNode) => {
    switch (node.kind) {
      case "literal":
      case "column":
        return;
      case "group":
        node.children.forEach(visit);
        return;
      case "case": {
        const args = node.children;
        const pairCount = Math.floor(args.length / 2);
        for (let index = 0; index < pairCount; index++) {
          const condition = args[index * 2];
          visit(condition);
          if (values.get(condition.id) === true) {
            visit(args[index * 2 + 1]);
            evaluate(node);
            return;
          }
        }
        if (args.length % 2 === 1) {
          visit(args[args.length - 1]);
        }
        evaluate(node);
        return;
      }
      default:
        node.children.forEach(visit);
        evaluate(node);
    }
  };
  visit(root);

  steps.forEach((step, index) => {
    step.next = steps[index + 1]?.result ?? null;
  });
  return steps;
}

export type Segment = {
  /** The same text has the same key in each step, for animations. */
  key: string;
  text: string;
  /** The part that this text shows the value of. */
  nodeId?: number;
  isValue?: boolean;
  /** The text is the result of the step. */
  isResult?: boolean;
  /** The text is in the part that the next step evaluates. */
  isNext?: boolean;
  /** The name of the column that this value comes from, as it is. */
  columnName?: string;
};

/** The text of the expression at a step, with values for evaluated parts. */
export function renderStep(
  source: string,
  root: EvalNode,
  step: Step,
  values: Map<number, RowValue>,
): Segment[] {
  const render = (node: EvalNode): Segment[] => {
    const segments = renderNode(node);
    return node.id === step.next
      ? segments.map((segment) => ({ ...segment, isNext: true }))
      : segments;
  };
  const renderNode = (node: EvalNode): Segment[] => {
    if (step.evaluated.has(node.id)) {
      return [
        {
          key: `value-${node.id}`,
          text: formatValue(values.get(node.id)),
          nodeId: node.id,
          columnName:
            node.kind === "column"
              ? source.slice(node.from, node.to).replace(/^\[|\]$/g, "")
              : undefined,
          isValue: true,
          isResult: node.id === step.result,
        },
      ];
    }
    // A group of one value needs no parentheses.
    if (
      node.kind === "group" &&
      node.children.length === 1 &&
      step.evaluated.has(node.children[0].id)
    ) {
      return render(node.children[0]);
    }
    const segments: Segment[] = [];
    let pos = node.from;
    for (const child of node.children) {
      segments.push({
        key: `text-${pos}`,
        text: source.slice(pos, child.from),
      });
      segments.push(...render(child));
      pos = child.to;
    }
    segments.push({
      key: `text-${pos}`,
      text: source.slice(pos, node.to),
    });
    return segments.filter((segment) => segment.text !== "");
  };
  return render(root);
}

export function formatValue(value: RowValue | undefined): string {
  if (value === null || value === undefined) {
    return "null";
  }
  if (typeof value === "number") {
    // Drop the noise of floating point numbers, like 0.30000000000000004.
    return String(Number(value.toPrecision(12)));
  }
  if (typeof value === "boolean") {
    return value ? "True" : "False";
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  return JSON.stringify(value);
}
