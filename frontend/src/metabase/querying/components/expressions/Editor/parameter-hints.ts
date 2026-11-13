import type { EditorState, Extension } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  type EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { useMemo } from "react";

import {
  EXPRESSION_PARAMETER_HINTS_SETTING,
  usePrototypeSetting,
} from "metabase/prototype";
import {
  getClauseDefinition,
  getMBQLName,
} from "metabase/querying/expressions";
import {
  BOOLEAN,
  CALL,
  COMMA,
  END_OF_INPUT,
  GROUP,
  GROUP_CLOSE,
  NUMBER,
  STRING,
  lexify,
} from "metabase/querying/expressions/pratt";

import S from "./Editor.module.css";

export type ParameterHintsMode = "literals" | "all";

type Argument = { pos: number; text: string; isLiteral: boolean };
type Call = { name: string | null; args: Argument[]; isAtArgStart: boolean };
type Hint = { pos: number; name: string };

/** The names of the arguments of a call, by their index. */
function getArgumentNames(name: string, count: number): (string | null)[] {
  const clause = getClauseDefinition(getMBQLName(name) ?? "");
  if (clause == null) {
    return [];
  }
  // `case` and `if` take pairs of a condition and its output, and an optional
  // default output at the end.
  if (clause.name === "case" || clause.name === "if") {
    return Array.from({ length: count }, (_, index) => {
      if (index === count - 1 && count % 2 === 1) {
        return "default";
      }
      return index % 2 === 0 ? "condition" : "output";
    });
  }
  const names = clause.args
    .map((arg) => arg.name)
    .filter((name) => name !== "…");
  // A name for one parameter says nothing new.
  if (names.length <= 1 && !clause.multiple) {
    return [];
  }
  return Array.from({ length: count }, (_, index) => {
    if (index < names.length) {
      return names[index];
    }
    // More arguments of the same kind: value3 after value1, value2.
    const last = names[names.length - 1];
    const match = clause.multiple ? /^(.*?)(\d+)$/.exec(last ?? "") : null;
    return match ? `${match[1]}${index + 1}` : null;
  });
}

const LITERALS = new Set([STRING, NUMBER, BOOLEAN]);

function getHints(source: string, mode: ParameterHintsMode): Hint[] {
  const hints: Hint[] = [];
  const calls: Call[] = [];
  let pendingName: string | null = null;

  const finish = (call: Call) => {
    if (call.name == null) {
      return;
    }
    const names = getArgumentNames(call.name, call.args.length);
    call.args.forEach((arg, index) => {
      const name = names[index];
      // A hint that repeats the argument says nothing, for example on the
      // placeholders of a function that autocomplete inserted.
      const isSameAsArgument = arg.text === name;
      if (
        name != null &&
        !isSameAsArgument &&
        (mode === "all" || arg.isLiteral)
      ) {
        hints.push({ pos: arg.pos, name });
      }
    });
  };

  for (const token of lexify(source)) {
    const call = calls[calls.length - 1];
    if (token.type === COMMA) {
      if (call) {
        call.isAtArgStart = true;
      }
      continue;
    }
    if (token.type === GROUP_CLOSE) {
      const closed = calls.pop();
      if (closed) {
        finish(closed);
      }
      continue;
    }
    if (token.type === END_OF_INPUT) {
      break;
    }
    if (call?.isAtArgStart) {
      call.args.push({
        pos: token.start,
        text: token.text,
        isLiteral: LITERALS.has(token.type),
      });
      call.isAtArgStart = false;
    }
    if (token.type === CALL) {
      pendingName = token.text;
    } else if (token.type === GROUP) {
      calls.push({ name: pendingName, args: [], isAtArgStart: true });
      pendingName = null;
    } else {
      pendingName = null;
    }
  }
  // Calls that the user did not close yet.
  calls.forEach(finish);
  return hints.sort((a, b) => a.pos - b.pos);
}

class HintWidget extends WidgetType {
  constructor(readonly name: string) {
    super();
  }

  eq(other: HintWidget) {
    return other.name === this.name;
  }

  toDOM() {
    const span = document.createElement("span");
    span.className = S.parameterHint;
    span.textContent = `${this.name}:`;
    return span;
  }
}

function buildDecorations(state: EditorState, mode: ParameterHintsMode) {
  const hints = getHints(state.doc.toString(), mode);
  return Decoration.set(
    hints.map(({ pos, name }) =>
      Decoration.widget({ widget: new HintWidget(name), side: -1 }).range(pos),
    ),
  );
}

/**
 * Inlay hints with the parameter name before each argument of a function
 * call, like the ones in VS Code.
 */
export function parameterHints(mode: ParameterHintsMode) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildDecorations(view.state, mode);
      }

      update(update: ViewUpdate) {
        if (update.docChanged) {
          this.decorations = buildDecorations(update.state, mode);
        }
      }
    },
    { decorations: (plugin) => plugin.decorations },
  );
}

/** The parameter hints extension, as the prototype setting chooses. */
export function useParameterHints(): Extension[] {
  const [mode] = usePrototypeSetting(EXPRESSION_PARAMETER_HINTS_SETTING);
  return useMemo(
    () => (mode === "literals" || mode === "all" ? [parameterHints(mode)] : []),
    [mode],
  );
}
