import { LRLanguage, LanguageSupport } from "@codemirror/language";
import { type Diagnostic, linter } from "@codemirror/lint";
import type { EditorView } from "@codemirror/view";
import { styleTags, tags as t } from "@lezer/highlight";

import type * as Lib from "metabase-lib";
import { diagnose } from "metabase-lib/v1/expressions/diagnostics";

import { parser } from "./parser";

const parserWithMetadata = parser.configure({
  props: [
    styleTags({
      Identifier: t.variableName,
      Boolean: t.bool,
      String: t.string,
      Number: t.number,
      ColumnReference: t.processingInstruction,
      Escape: t.escape,
      "CallExpression/Identifier": t.function(t.variableName),
      "AND OR NOT": t.logicOperator,
      '+ - "*" "/"': t.arithmeticOperator,
      '< > =< => = "!-"': t.compareOperator,
      "( )": t.paren,
      "[ ]": t.bracket,
      "{ }": t.brace,
    }),
  ],
});

const expressionLanguage = LRLanguage.define({
  parser: parserWithMetadata,
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
  linter((view: EditorView): Diagnostic[] => {
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
  });

export function customExpression(options: LintOptions) {
  return new LanguageSupport(expressionLanguage, [lint(options)]);
}
