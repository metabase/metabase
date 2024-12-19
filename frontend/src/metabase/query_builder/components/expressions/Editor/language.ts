import { LRLanguage, LanguageSupport } from "@codemirror/language";
import { styleTags, tags as t } from "@lezer/highlight";

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

export function customExpression() {
  return new LanguageSupport(expressionLanguage, []);
}
