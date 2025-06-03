import { LRLanguage, LanguageSupport } from "@codemirror/language";
import { type Diagnostic, linter } from "@codemirror/lint";
import type { EditorView } from "@codemirror/view";

import type * as Lib from "metabase-lib";
import type { ExpressionError } from "metabase-lib/v1/expressions";
import { diagnoseAndCompile } from "metabase-lib/v1/expressions";
import { parser } from "metabase-lib/v1/expressions/tokenizer/parser";
import type Metadata from "metabase-lib/v1/metadata/Metadata";

import { DEBOUNCE_VALIDATION_MS } from "./constants";

const expressionLanguage = LRLanguage.define({
  parser,
  languageData: {},
});

type LintOptions = {
  expressionMode: Lib.ExpressionMode;
  query: Lib.Query;
  stageIndex: number;
  expressionIndex?: number | undefined;
  metadata: Metadata;
};

const lint = (options: LintOptions) =>
  linter(
    (view: EditorView): Diagnostic[] => {
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
  return new LanguageSupport(expressionLanguage, [lint(options)]);
}
