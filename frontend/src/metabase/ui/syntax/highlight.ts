import { HighlightStyle } from "@codemirror/language";
import { tags } from "@lezer/highlight";

import S from "./highlight.module.css";

export const metabaseSyntaxHighlighting = HighlightStyle.define([
  { tag: tags.arithmeticOperator, class: S.arithmeticOperator },
  { tag: tags.blockComment, class: S.blockComment },
  { tag: tags.bool, class: S.bool },
  { tag: tags.brace, class: S.brace },
  { tag: tags.comment, class: S.comment },
  { tag: tags.compareOperator, class: S.compareOperator },
  { tag: tags.constant(tags.variableName), class: S.constant },
  { tag: tags.escape, class: S.escape },
  { tag: tags.function(tags.variableName), class: S.variableName },
  { tag: tags.keyword, class: S.keyword },
  { tag: tags.lineComment, class: S.lineComment },
  { tag: tags.logicOperator, class: S.logicOperator },
  { tag: tags.number, class: S.number },
  { tag: tags.paren, class: S.paren },
  { tag: tags.processingInstruction, class: S.processingInstruction },
  { tag: tags.special(tags.string), class: S.string },
  { tag: tags.squareBracket, class: S.squareBracket },
  { tag: tags.string, class: S.string },
  { tag: tags.typeName, class: S.typeName },
  { tag: tags.variableName, class: S.variableName },
]);
