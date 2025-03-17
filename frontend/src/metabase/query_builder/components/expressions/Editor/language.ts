import { LRLanguage, LanguageSupport } from "@codemirror/language";
import { type Diagnostic, linter } from "@codemirror/lint";
import type { EditorView } from "@codemirror/view";

import type * as Lib from "metabase-lib";
import type { ErrorWithMessage } from "metabase-lib/v1/expressions";
import { parser } from "metabase-lib/v1/expressions/tokenizer/parser";
import type Metadata from "metabase-lib/v1/metadata/Metadata";

import type { StartRule } from "../types";

import { DEBOUNCE_VALIDATION_MS } from "./constants";
import { diagnoseAndCompileExpression } from "./utils";

const expressionLanguage = LRLanguage.define({
  parser,
  languageData: {},
});

type LintOptions = {
  startRule: StartRule;
  query: Lib.Query;
  stageIndex: number;
  name?: string;
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
      const { error } = diagnoseAndCompileExpression(source, options);

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

function getErrorPosition(error: ErrorWithMessage | Error) {
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
