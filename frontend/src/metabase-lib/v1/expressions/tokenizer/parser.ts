import { styleTags, tags as t } from "@lezer/highlight";

import { parser as baseParser } from "./lezer";

export const tags = styleTags({
  Identifier: t.variableName,
  Boolean: t.bool,
  True: t.bool,
  False: t.bool,
  String: t.string,
  Number: t.number,
  Field: t.processingInstruction,
  Escape: t.escape,
  "CallExpression/Identifier": t.function(t.variableName),
  And: t.logicOperator,
  Or: t.logicOperator,
  Not: t.logicOperator,
  '+ - "*" "/"': t.arithmeticOperator,
  '< > =< => = "!-"': t.compareOperator,
  "( )": t.paren,
  "[ ]": t.bracket,
  "{ }": t.brace,
});

export const parser = baseParser.configure({
  props: [tags],
});
