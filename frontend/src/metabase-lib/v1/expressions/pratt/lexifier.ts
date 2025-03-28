import { OPERATOR, TOKEN, tokenize } from "../tokenizer";

import {
  ADD,
  BAD_TOKEN,
  BOOLEAN,
  CALL,
  COMMA,
  COMPARISON,
  END_OF_INPUT,
  EQUALITY,
  FIELD,
  GROUP,
  GROUP_CLOSE,
  IDENTIFIER,
  LOGICAL_AND,
  LOGICAL_NOT,
  LOGICAL_OR,
  MULDIV_OP,
  NUMBER,
  STRING,
  SUB,
  WS,
} from "./syntax";
import type { Token } from "./types";

export function lexify(expression: string) {
  const lexs: Token[] = [];

  const { tokens, errors } = tokenize(expression);
  if (errors && errors.length > 0) {
    errors.forEach((error) => {
      const { pos } = error;

      if (typeof pos === "number") {
        lexs.push({ type: BAD_TOKEN, text: expression[pos], length: 1, pos });
      }
    });
  }

  let start = 0;
  for (let i = 0; i < tokens.length; ++i) {
    const token = tokens[i];
    if (start < token.start) {
      lexs.push({
        type: WS,
        text: expression.slice(start, token.start),
        length: token.start - start,
        pos: start,
      });
    }
    start = token.end;
    let text = expression.slice(token.start, token.end);
    let value = undefined;
    const pos = token.start;
    let length = token.end - token.start;
    let type = BAD_TOKEN;
    switch (token.type) {
      case TOKEN.Number:
        type = NUMBER;
        break;
      case TOKEN.String:
        type = STRING;
        value = token.value;
        break;
      case TOKEN.Identifier:
        type = text[0] === "[" ? FIELD : IDENTIFIER;
        break;
      case TOKEN.Boolean:
        type = BOOLEAN;
        break;
      case TOKEN.Operator:
        switch (token.op) {
          case OPERATOR.Comma:
            type = COMMA;
            break;
          case OPERATOR.OpenParenthesis:
            type = GROUP;
            break;
          case OPERATOR.CloseParenthesis:
            type = GROUP_CLOSE;
            break;
          case OPERATOR.Plus:
            type = ADD;
            break;
          case OPERATOR.Minus:
            type = SUB;
            break;
          case OPERATOR.Star:
          case OPERATOR.Slash:
            type = MULDIV_OP;
            break;
          case OPERATOR.Equal:
          case OPERATOR.NotEqual:
            type = EQUALITY;
            break;
          case OPERATOR.LessThan:
          case OPERATOR.GreaterThan:
          case OPERATOR.LessThanEqual:
          case OPERATOR.GreaterThanEqual:
            type = COMPARISON;
            break;
          case OPERATOR.Not:
            type = LOGICAL_NOT;
            break;
          case OPERATOR.And:
            type = LOGICAL_AND;
            break;
          case OPERATOR.Or:
            type = LOGICAL_OR;
            break;
          default:
            break;
        }
        break;
    }

    if (type === IDENTIFIER) {
      const next = tokens[i + 1];
      if (
        next &&
        next.type === TOKEN.Operator &&
        next.op === OPERATOR.OpenParenthesis
      ) {
        type = CALL;
        length = next.start - token.start;
        text = expression.slice(token.start, next.start);
        start = next.start;
      }
    }

    lexs.push({ type, text, length, pos, value });
  }

  // This simplifies the parser
  lexs.push({
    type: END_OF_INPUT,
    text: "\n",
    length: 1,
    pos: expression.length,
  });

  return lexs.sort((a, b) => a.pos - b.pos);
}
