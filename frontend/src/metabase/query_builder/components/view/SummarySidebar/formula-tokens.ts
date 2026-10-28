import { syntaxTree } from "@codemirror/language";
import { type Extension, RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";

import { getMBQLName } from "metabase/querying/expressions";

import S from "./SummarySidebar.module.css";

// one class per distinct column in a formula, cycling like spreadsheet range colors
const COLUMN_CLASS_NAMES = [
  S.tokenColumn0,
  S.tokenColumn1,
  S.tokenColumn2,
  S.tokenColumn3,
  S.tokenColumn4,
  S.tokenColumn5,
];

const COMPARISON_AND_ARITHMETIC_OPERATORS = new Set([
  "+",
  "-",
  "*",
  "/",
  "=",
  "!=",
  "<",
  "<=",
  ">",
  ">=",
]);

const columnMarks = COLUMN_CLASS_NAMES.map((className) =>
  Decoration.mark({ class: className }),
);
const functionMark = /* #__PURE__ */ Decoration.mark({
  class: S.tokenFunction,
});
const literalMark = /* #__PURE__ */ Decoration.mark({ class: S.tokenLiteral });
const operatorMark = /* #__PURE__ */ Decoration.mark({
  class: S.tokenOperator,
});
const atomicMark = /* #__PURE__ */ Decoration.mark({});

type FormulaTokens = {
  decorations: DecorationSet;
  atomicRanges: DecorationSet;
};

function buildFormulaTokens(view: EditorView): FormulaTokens {
  const decorations = new RangeSetBuilder<Decoration>();
  const atomicRanges = new RangeSetBuilder<Decoration>();
  const colorIndexByColumn = new Map<string, number>();
  const { doc, selection } = view.state;
  const caret = selection.main;

  syntaxTree(view.state).iterate({
    enter: (node) => {
      const add = (mark: Decoration) =>
        decorations.add(node.from, node.to, mark);
      // a token that behaves as one unit: arrows skip it, backspace deletes it. Not while the
      // caret is inside it, as it is while typing one, so it can still be edited a character at a time
      const addAtomic = () => {
        const hasCaretInside =
          caret.empty && caret.head > node.from && caret.head < node.to;
        if (!hasCaretInside) {
          atomicRanges.add(node.from, node.to, atomicMark);
        }
      };

      switch (node.name) {
        case "Field": {
          const text = doc.sliceString(node.from, node.to);
          const columnKey = text
            .replace(/^\[|\]$/g, "")
            .trim()
            .toLowerCase();
          const colorIndex =
            colorIndexByColumn.get(columnKey) ?? colorIndexByColumn.size;
          colorIndexByColumn.set(columnKey, colorIndex);
          add(columnMarks[colorIndex % columnMarks.length]);
          // only a complete reference: closing brackets are auto-inserted while typing one
          if (text.endsWith("]")) {
            addAtomic();
          }
          return false;
        }
        case "Identifier":
          if (node.node.parent?.name === "CallExpression") {
            add(functionMark);
          }
          // a function's name, even once its parentheses are deleted
          if (getMBQLName(doc.sliceString(node.from, node.to)) != null) {
            addAtomic();
          }
          return false;
        case "Number":
        case "String":
        case "True":
        case "False":
          add(literalMark);
          return false;
        case "And":
        case "Or":
        case "Not":
          add(operatorMark);
          return false;
        default:
          if (COMPARISON_AND_ARITHMETIC_OPERATORS.has(node.name)) {
            add(operatorMark);
            return false;
          }
          return undefined;
      }
    },
  });

  return {
    decorations: decorations.finish(),
    atomicRanges: atomicRanges.finish(),
  };
}

/**
 * Spreadsheet-style token styling for custom expressions: each distinct column reference gets
 * its own color, column references and function names act as single tokens, and functions,
 * literals, and operators are styled apart from each other.
 */
export function formulaTokens(): Extension {
  const plugin = ViewPlugin.fromClass(
    class {
      tokens: FormulaTokens;

      constructor(view: EditorView) {
        this.tokens = buildFormulaTokens(view);
      }

      update(update: ViewUpdate) {
        if (
          update.docChanged ||
          update.selectionSet ||
          update.viewportChanged ||
          syntaxTree(update.startState) !== syntaxTree(update.state)
        ) {
          this.tokens = buildFormulaTokens(update.view);
        }
      }
    },
    {
      decorations: (value) => value.tokens.decorations,
    },
  );

  return [
    plugin,
    EditorView.atomicRanges.of(
      (view) => view.plugin(plugin)?.tokens.atomicRanges ?? Decoration.none,
    ),
  ];
}
