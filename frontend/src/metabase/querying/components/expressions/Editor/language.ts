import { LRLanguage, LanguageSupport } from "@codemirror/language";
import {
  type Diagnostic,
  forceLinting,
  linter,
  setDiagnostics,
} from "@codemirror/lint";
import { StateEffect, StateField } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

import {
  type ExpressionError,
  diagnoseAndCompile,
} from "metabase/querying/expressions";
import { parser } from "metabase/querying/expressions/tokenizer/parser";
import type * as Lib from "metabase-lib";
import type { Database } from "metabase-types/api";

import { DEBOUNCE_VALIDATION_MS } from "./constants";
import { hasActiveSnippet } from "./utils";

const expressionLanguage = LRLanguage.define({
  parser,
  languageData: {},
});

type LintOptions = {
  expressionMode: Lib.ExpressionMode;
  query: Lib.Query;
  stageIndex: number;
  availableColumns: Lib.ColumnMetadata[];
  availableMetrics?: Lib.MetricMetadata[];
  database: Pick<Database, "features"> | undefined;
};

const setShowErrors = StateEffect.define<boolean>();

/** False while errors are hidden, so that the user can type freely. */
const showErrorsField = StateField.define<boolean>({
  create: () => true,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setShowErrors)) {
        return effect.value;
      }
    }
    return value;
  },
});

/** Shows or hides the error marks in the code. */
export function showErrors(view: EditorView, isShown: boolean) {
  if (view.state.field(showErrorsField, false) === isShown) {
    return;
  }
  view.dispatch({ effects: setShowErrors.of(isShown) });
  if (isShown) {
    forceLinting(view);
  } else {
    view.dispatch(setDiagnostics(view.state, []));
  }
}

const lint = (options: LintOptions) =>
  linter(
    (view: EditorView): Diagnostic[] => {
      if (
        !view.state.field(showErrorsField, false) ||
        hasActiveSnippet(view.state)
      ) {
        return [];
      }

      const source = view.state.doc.toString();
      if (source === "") {
        return [];
      }
      const { error } = diagnoseAndCompile({ source, ...options });

      if (!error) {
        return [];
      }

      const position = getErrorPosition(error);

      return [
        {
          severity: "error",
          message: error.message,
          ...position,
        },
      ];
    },
    {
      delay: DEBOUNCE_VALIDATION_MS,
      tooltipFilter: () => [],
      needsRefresh: (update) =>
        update.transactions.some((tr) =>
          tr.effects.some((effect) => effect.is(setShowErrors)),
        ),
    },
  );

function getErrorPosition(error: ExpressionError | Error) {
  if ("pos" in error && "len" in error) {
    const pos = error.pos ?? 0;
    const len = error.len ?? 0;
    return {
      from: pos,
      to: pos + len,
    };
  }

  return {
    from: 0,
    to: 0,
  };
}

export function customExpression(options: LintOptions) {
  return new LanguageSupport(expressionLanguage, [
    showErrorsField,
    lint(options),
  ]);
}
