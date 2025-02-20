import { LRLanguage, LanguageSupport } from "@codemirror/language";
import { type Diagnostic, linter } from "@codemirror/lint";
import type { EditorView } from "@codemirror/view";

import type * as Lib from "metabase-lib";
import { diagnose } from "metabase-lib/v1/expressions/diagnostics";
import { parser } from "metabase-lib/v1/expressions/tokenizer/parser";

const expressionLanguage = LRLanguage.define({
  parser,
  languageData: {},
});

type LintOptions = {
  startRule: "expression" | "aggregation" | "boolean";
  query: Lib.Query;
  stageIndex: number;
  name?: string | null;
  expressionIndex: number | undefined;
};

const lint = (options: LintOptions) =>
  linter(
    (view: EditorView): Diagnostic[] => {
      const source = view.state.doc.toString();
      const error = diagnose({
        source,
        ...options,
      });
      if (!error || error.pos == null || error.len == null) {
        return [];
      }

      return [
        {
          from: error.pos,
          to: error.pos + error.len,
          severity: "error",
          message: error.message,
        },
      ];
    },
    {
      tooltipFilter: () => [],
    },
  );

export function customExpression(options: LintOptions) {
  return new LanguageSupport(expressionLanguage, [lint(options)]);
}
