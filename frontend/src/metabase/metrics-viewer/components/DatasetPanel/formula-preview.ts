import { syntaxTree } from "@codemirror/language";
import type { EditorState, Range } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";

import { unquoteString } from "metabase/querying/expressions/string";

import {
  BLOCK_OPERATORS,
  getFunctionDisplayName,
} from "../../utils/formula-blocks";

import S from "./FormulaEditor.module.css";

type Span = { from: number; to: number };

/** A function call whose arguments are all plain column references. */
export type FormulaCall = Span & {
  name: Span & { text: string };
  columns: (Span & { label: string })[];
};

export type BlockClick = {
  call: FormulaCall;
  part: "function" | "column";
  columnIndex: number;
  anchor: DOMRect;
};

function readText(state: EditorState, { from, to }: Span) {
  return state.doc.sliceString(from, to);
}

function getColumnLabel(text: string) {
  return text.startsWith("[") ? unquoteString(text, "[") : text;
}

/** Reads a call node, or returns null when it has anything but column args. */
export function readFormulaCall(
  state: EditorState,
  node: SyntaxNode,
): FormulaCall | null {
  const identifier = node.getChild("Identifier");
  if (
    !identifier ||
    !node.lastChild ||
    readText(state, node.lastChild) !== ")"
  ) {
    return null;
  }
  const args = node.getChild("ArgList")?.getChildren("Arg") ?? [];
  const columns: FormulaCall["columns"] = [];
  for (const arg of args) {
    const field = arg.firstChild;
    if (!field || field.name !== "Field" || field.nextSibling) {
      return null;
    }
    columns.push({
      from: field.from,
      to: field.to,
      label: getColumnLabel(readText(state, field)),
    });
  }
  return {
    from: node.from,
    to: node.to,
    name: {
      from: identifier.from,
      to: identifier.to,
      text: readText(state, identifier),
    },
    columns,
  };
}

/** Finds the call that starts at `pos`, if it can be shown as a block. */
export function getFormulaCallAt(
  state: EditorState,
  pos: number,
): FormulaCall | null {
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, 1);
  while (node && !(node.name === "CallExpression" && node.from === pos)) {
    node = node.parent;
  }
  return node ? readFormulaCall(state, node) : null;
}

class CallBlockWidget extends WidgetType {
  constructor(
    readonly functionLabel: string,
    readonly columnLabels: readonly string[],
  ) {
    super();
  }

  eq(other: CallBlockWidget) {
    return (
      this.functionLabel === other.functionLabel &&
      this.columnLabels.join("\u0000") === other.columnLabels.join("\u0000")
    );
  }

  toDOM() {
    const block = document.createElement("span");
    block.className = S.block;
    block.dataset.formulaBlock = "true";
    block.setAttribute("role", "group");
    block.setAttribute(
      "aria-label",
      [this.functionLabel, ...this.columnLabels].join(" "),
    );

    const fn = document.createElement("span");
    fn.className = S.blockFunction;
    fn.dataset.blockPart = "function";
    fn.textContent = this.functionLabel;
    block.append(fn);

    this.columnLabels.forEach((label, index) => {
      const column = document.createElement("span");
      column.className = S.blockColumn;
      column.dataset.blockPart = "column";
      column.dataset.columnIndex = String(index);
      column.textContent = label;
      block.append(column);
    });
    return block;
  }

  ignoreEvent() {
    return false;
  }
}

/** A saved metric or measure referenced on its own, such as `[Revenue]`. */
class ReferenceBlockWidget extends WidgetType {
  constructor(readonly label: string) {
    super();
  }

  eq(other: ReferenceBlockWidget) {
    return this.label === other.label;
  }

  toDOM() {
    const block = document.createElement("span");
    block.className = `${S.block} ${S.blockReference}`;
    block.dataset.formulaReference = "true";
    block.setAttribute("role", "group");
    block.setAttribute("aria-label", this.label);
    block.textContent = this.label;
    return block;
  }
}

function isInsideCall(node: SyntaxNode) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (parent.name === "CallExpression") {
      return true;
    }
  }
  return false;
}

const operatorMark = /* #__PURE__ */ Decoration.mark({ class: S.operator });
const numberMark = /* #__PURE__ */ Decoration.mark({ class: S.number });

function getOperatorRange(
  state: EditorState,
  node: SyntaxNode,
): Range<Decoration> | null {
  const left = node.firstChild;
  const right = left?.nextSibling;
  if (!left || !right) {
    return null;
  }
  const between = state.doc.sliceString(left.to, right.from);
  const offset = between.search(/\S/);
  const isBlockOperator = BLOCK_OPERATORS.some(
    ({ operator }) => operator === between.trim(),
  );
  return offset >= 0 && isBlockOperator
    ? operatorMark.range(left.to + offset, left.to + offset + 1)
    : null;
}

function buildDecorations(view: EditorView): DecorationSet {
  const { state } = view;
  const head = state.selection.main.head;
  const decorations: Range<Decoration>[] = [];

  syntaxTree(state).iterate({
    enter(ref) {
      if (ref.name === "CallExpression") {
        const isEditing = view.hasFocus && head >= ref.from && head <= ref.to;
        const call = isEditing ? null : readFormulaCall(state, ref.node);
        if (call) {
          const widget = new CallBlockWidget(
            getFunctionDisplayName(call.name.text.toLowerCase()),
            call.columns.map(({ label }) => label),
          );
          decorations.push(
            Decoration.replace({ widget }).range(call.from, call.to),
          );
          return false;
        }
      }
      if (ref.name === "Field" && !isInsideCall(ref.node)) {
        const isEditing = view.hasFocus && head >= ref.from && head <= ref.to;
        if (!isEditing) {
          const widget = new ReferenceBlockWidget(
            getColumnLabel(state.doc.sliceString(ref.from, ref.to)),
          );
          decorations.push(
            Decoration.replace({ widget }).range(ref.from, ref.to),
          );
        }
        return false;
      }
      if (ref.name === "Number") {
        decorations.push(numberMark.range(ref.from, ref.to));
      }
      if (ref.name === "BinaryExpression") {
        const operator = getOperatorRange(state, ref.node);
        if (operator) {
          decorations.push(operator);
        }
      }
      return undefined;
    },
  });

  return Decoration.set(decorations, true);
}

/**
 * Shows each finished function call as a block while the cursor is elsewhere,
 * and reports clicks on a block's function or column.
 */
export function formulaPreview(onBlockClick: (click: BlockClick) => void) {
  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildDecorations(view);
      }

      update(update: ViewUpdate) {
        const treeChanged =
          syntaxTree(update.startState) !== syntaxTree(update.state);
        if (
          update.docChanged ||
          update.selectionSet ||
          update.focusChanged ||
          treeChanged
        ) {
          this.decorations = buildDecorations(update.view);
        }
      }
    },
    { decorations: (value) => value.decorations },
  );

  const clicks = EditorView.domEventHandlers({
    mousedown(event, view) {
      if (!(event.target instanceof HTMLElement)) {
        return false;
      }
      const part = event.target.closest<HTMLElement>("[data-block-part]");
      const block = part?.closest<HTMLElement>("[data-formula-block]");
      if (!part || !block) {
        return false;
      }
      const call = getFormulaCallAt(view.state, view.posAtDOM(block));
      if (!call) {
        return false;
      }
      event.preventDefault();
      onBlockClick({
        call,
        part: part.dataset.blockPart === "column" ? "column" : "function",
        columnIndex: Number(part.dataset.columnIndex ?? 0),
        anchor: part.getBoundingClientRect(),
      });
      return true;
    },
  });

  return [plugin, clicks];
}
