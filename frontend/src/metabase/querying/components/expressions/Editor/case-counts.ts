import { StateEffect, StateField } from "@codemirror/state";
import {
  Decoration,
  type EditorView,
  EditorView as EditorViewClass,
  WidgetType,
} from "@codemirror/view";
import { useEffect, useMemo, useRef } from "react";
import { msgid, ngettext } from "ttag";

import { skipToken, useGetAdhocQueryQuery } from "metabase/api";
import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import {
  EXPRESSION_CASE_COUNTS_SETTING,
  usePrototypeSetting,
} from "metabase/prototype";
import { getMBQLName } from "metabase/querying/expressions";
import {
  CALL,
  COMMA,
  END_OF_INPUT,
  GROUP,
  GROUP_CLOSE,
  lexify,
} from "metabase/querying/expressions/pratt";
import * as Lib from "metabase-lib";

import S from "./Editor.module.css";

// A pause in typing before the counts run.
const COUNT_DELAY = 600;

// The branch number of a row that does not get to a `case`.
const NOT_REACHED = -1;
// The branch number of the default value.
const DEFAULT_BRANCH = 0;

type CaseCounts = {
  /** The text that the counts are for. */
  source: string;
  /** For each `case` in the text, the rows of its branches and default. */
  counts: number[][];
};

const setCaseCounts = /* #__PURE__ */ StateEffect.define<CaseCounts | null>();

const caseCountsField = /* #__PURE__ */ StateField.define<CaseCounts | null>({
  create: () => null,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setCaseCounts)) {
        return effect.value;
      }
    }
    return value;
  },
  provide: (field) =>
    EditorViewClass.decorations.compute([field, "doc"], (state) => {
      const value = state.field(field);
      const source = state.doc.toString();
      // Counts for another text would be at wrong places.
      if (value == null || value.source !== source) {
        return Decoration.none;
      }
      const chips = getChipPositions(source).flatMap((positions, caseIndex) =>
        positions.flatMap((pos, index) => {
          const count = value.counts[caseIndex]?.[index];
          return count == null
            ? []
            : [
                Decoration.widget({
                  widget: new CountWidget(count),
                  side: 1,
                }).range(pos),
              ];
        }),
      );
      return Decoration.set(chips, true);
    }),
});

/** The extension that shows the counts of `useCaseCounts`. */
export const caseCounts = caseCountsField;

class CountWidget extends WidgetType {
  constructor(readonly count: number) {
    super();
  }

  eq(other: CountWidget) {
    return other.count === this.count;
  }

  toDOM() {
    const span = document.createElement("span");
    span.className = S.caseCount;
    span.textContent = ngettext(
      msgid`${this.count.toLocaleString()} row`,
      `${this.count.toLocaleString()} rows`,
      this.count,
    );
    return span;
  }
}

/**
 * For each `case` and `if` in the text, in the order of the text, the places
 * of its chips: after each condition, and after the default value.
 */
function getChipPositions(source: string): number[][] {
  const tokens = lexify(source).filter((token) => token.type !== END_OF_INPUT);
  const result: number[][] = [];

  tokens.forEach((token, index) => {
    const name = token.type === CALL ? getMBQLName(token.text.trim()) : null;
    if (
      (name !== "case" && name !== "if") ||
      tokens[index + 1]?.type !== GROUP
    ) {
      return;
    }

    // The place of the chip of each argument of the call: its end, or for a
    // function call on several lines, after its "(", on its first line.
    const chipPositions: number[] = [];
    let depth = 0;
    let first: number | null = null;
    let lastEnd: number | null = null;
    const finishArg = () => {
      if (first == null || lastEnd == null) {
        return;
      }
      const [start, open] = [tokens[first], tokens[first + 1]];
      const isMultilineCall =
        start.type === CALL &&
        open?.type === GROUP &&
        source.slice(start.start, lastEnd).includes("\n");
      chipPositions.push(isMultilineCall ? open.end : lastEnd);
    };
    for (let i = index + 2; i < tokens.length; i++) {
      const next = tokens[i];
      const isEndOfArg =
        depth === 0 && (next.type === COMMA || next.type === GROUP_CLOSE);
      if (isEndOfArg) {
        finishArg();
        first = null;
        lastEnd = null;
        if (next.type === GROUP_CLOSE) {
          break;
        }
        continue;
      }
      if (next.type === GROUP) {
        depth++;
      } else if (next.type === GROUP_CLOSE) {
        depth--;
      }
      first ??= i;
      lastEnd = next.end;
    }
    finishArg();

    const { branchCount, hasDefault } = getShape(chipPositions);
    const conditionPositions = chipPositions.filter(
      (_, argIndex) => argIndex % 2 === 0 && argIndex < branchCount * 2,
    );
    result.push(
      hasDefault
        ? [...conditionPositions, chipPositions.at(-1)!]
        : conditionPositions,
    );
  });
  return result;
}

type Arg = Lib.ExpressionParts | Lib.ExpressionArg;
/** Puts an expression in the place of a `case` inside the whole expression. */
type Wrap = (inner: Arg) => Arg;

type CaseNode = { node: Lib.ExpressionParts; wrap: Wrap };

function isCase(parts: Lib.ExpressionParts) {
  return parts.operator === "case" || parts.operator === "if";
}

/** `case` and `if` take pairs of a condition and an output, and a default. */
function getShape(args: unknown[]) {
  return {
    branchCount: Math.floor(args.length / 2),
    hasDefault: args.length % 2 === 1,
  };
}

function caseOf(args: Arg[]): Lib.ExpressionParts {
  return { operator: "case", options: {}, args };
}

/**
 * Every `case` and `if` in the expression, in the order of the text. Each one
 * comes with a function that gives NOT_REACHED for the rows that do not get to
 * it, for example a `case` in the output of a branch that the row does not
 * take.
 */
function getCaseNodes(
  parts: Lib.ExpressionParts,
  wrap: Wrap = (inner) => inner,
  nodes: CaseNode[] = [],
): CaseNode[] {
  if (isCase(parts)) {
    nodes.push({ node: parts, wrap });
  }
  parts.args.forEach((arg, index) => {
    if (Lib.isExpressionParts(arg)) {
      getCaseNodes(
        arg,
        isCase(parts) ? getArgWrap(parts, index, wrap) : wrap,
        nodes,
      );
    }
  });
  return nodes;
}

/** The rows that get to the argument at `index` of a `case`. */
function getArgWrap(
  parts: Lib.ExpressionParts,
  index: number,
  wrap: Wrap,
): Wrap {
  const { branchCount } = getShape(parts.args);
  // Rows that match one of the first `count` conditions go elsewhere.
  const skipFirst = (count: number) =>
    parts.args
      .slice(0, count * 2)
      .filter((_, argIndex) => argIndex % 2 === 0)
      .flatMap((condition) => [condition, NOT_REACHED]);

  if (index < branchCount * 2 && index % 2 === 0) {
    // A condition: the rows that the earlier conditions don't match.
    const count = index / 2;
    return (inner) =>
      wrap(count === 0 ? inner : caseOf([...skipFirst(count), inner]));
  }
  if (index < branchCount * 2) {
    // An output: the rows that take this branch.
    const count = (index - 1) / 2;
    return (inner) =>
      wrap(
        caseOf([
          ...skipFirst(count),
          parts.args[index - 1],
          inner,
          NOT_REACHED,
        ]),
      );
  }
  // The default: the rows that no condition matches.
  return (inner) => wrap(caseOf([...skipFirst(branchCount), inner]));
}

/**
 * A query with a conditional count for each branch of each `case`. A row
 * counts for the first branch that it matches, the same as in `case`.
 */
function getCountQuery(
  query: Lib.Query,
  stageIndex: number,
  expressionIndex: number | undefined,
  clause: Lib.ExpressionClause,
) {
  const parts = Lib.expressionParts(query, stageIndex, clause);
  if (!Lib.isExpressionParts(parts)) {
    return null;
  }
  const nodes = getCaseNodes(parts);
  if (nodes.length === 0) {
    return null;
  }

  // The rows before this custom column, like the preview uses.
  const base =
    expressionIndex == null
      ? Lib.previewQuery(query, stageIndex, "expressions", null)
      : expressionIndex === 0
        ? Lib.previewQuery(query, stageIndex, "joins", null)
        : Lib.previewQuery(
            query,
            stageIndex,
            "expressions",
            expressionIndex - 1,
          );
  if (base == null) {
    return null;
  }

  const shapes: number[] = [];
  let countQuery = base;
  for (const { node, wrap } of nodes) {
    const { branchCount, hasDefault } = getShape(node.args);
    const conditions = node.args.filter(
      (_, index) => index % 2 === 0 && index < branchCount * 2,
    );
    const branch = wrap(
      caseOf([
        ...conditions.flatMap((condition, index) => [condition, index + 1]),
        DEFAULT_BRANCH,
      ]),
    );
    const branches = Array.from(
      { length: branchCount },
      (_, index) => index + 1,
    );
    if (hasDefault) {
      branches.push(DEFAULT_BRANCH);
    }
    for (const number of branches) {
      countQuery = Lib.aggregate(
        countQuery,
        stageIndex,
        Lib.expressionClause("count-where", [
          Lib.expressionClause("=", [branch, number]),
        ]),
      );
    }
    shapes.push(branches.length);
  }
  return { query: countQuery, shapes };
}

/**
 * Shows the number of rows of each branch of each `case` and `if` as a chip
 * after its condition. A `case` inside another one counts only the rows that
 * get to it. The counts run after a pause in typing, for a valid text.
 */
export function useCaseCounts({
  getView,
  source,
  query,
  stageIndex,
  expressionIndex,
  expressionMode,
  compile,
}: {
  getView: () => EditorView | undefined;
  source: string;
  query: Lib.Query;
  stageIndex: number;
  expressionIndex: number | undefined;
  expressionMode: Lib.ExpressionMode;
  compile: (source: string) => Lib.ExpressionClause | null;
}) {
  const [isSettingOn] = usePrototypeSetting(EXPRESSION_CASE_COUNTS_SETTING);
  const isEnabled = isSettingOn && expressionMode === "expression";
  const debouncedSource = useDebouncedValue(source, COUNT_DELAY);

  // Each valid edit saves the expression, which gives a new `query`. Build
  // the count query only for a new text, so that it does not run again.
  const latestRef = useRef({ query, stageIndex, expressionIndex, compile });
  latestRef.current = { query, stageIndex, expressionIndex, compile };
  const countQuery = useMemo(() => {
    const positions = getChipPositions(debouncedSource);
    if (!isEnabled || positions.length === 0) {
      return null;
    }
    const { query, stageIndex, expressionIndex, compile } = latestRef.current;
    const clause = compile(debouncedSource);
    if (clause == null) {
      return null;
    }
    try {
      const result = getCountQuery(query, stageIndex, expressionIndex, clause);
      // The chips go to the calls of the text in the same order.
      const isMatch =
        result != null &&
        result.shapes.length === positions.length &&
        result.shapes.every((size, index) => size === positions[index].length);
      return isMatch ? { ...result, source: debouncedSource } : null;
    } catch {
      return null;
    }
  }, [debouncedSource, isEnabled]);

  const { data } = useGetAdhocQueryQuery(
    countQuery ? Lib.toJsQuery(countQuery.query) : skipToken,
  );

  useEffect(() => {
    const view = getView();
    if (view == null) {
      return;
    }
    const row = data?.data?.rows?.[0];
    if (countQuery == null || row == null) {
      view.dispatch({ effects: setCaseCounts.of(null) });
      return;
    }
    let offset = 0;
    const counts = countQuery.shapes.map((size) => {
      const values = row.slice(offset, offset + size).map(Number);
      offset += size;
      return values;
    });
    view.dispatch({
      effects: setCaseCounts.of({ source: countQuery.source, counts }),
    });
  }, [getView, data, countQuery]);
}
