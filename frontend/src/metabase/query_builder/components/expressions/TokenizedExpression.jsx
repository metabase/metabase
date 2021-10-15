/* eslint-disable react/prop-types */
import React from "react";

import "./TokenizedExpression.css";

import cx from "classnames";

import { tokenize, TOKEN, OPERATOR } from "metabase/lib/expressions/tokenizer";
import { getMBQLName, FUNCTIONS } from "metabase/lib/expressions/config";

function mapTokenType(token) {
  const { type, op } = token;
  switch (type) {
    case TOKEN.Operator:
      return op === OPERATOR.OpenParenthesis
        ? "open-paren"
        : op === OPERATOR.CloseParenthesis
        ? "close-paren"
        : "operator";
    case TOKEN.Number:
      return "number-literal";
    case TOKEN.String:
      return "string-literal";
    case TOKEN.Identifier:
      // FIXME metric vs dimension vs segment
      return "dimension";
    default:
      return "token";
  }
}

function createSpans(source) {
  const isFunction = name => FUNCTIONS.has(getMBQLName(name));
  const { tokens } = tokenize(source);
  let lastPos = 0;
  const spans = [];
  tokens.forEach(token => {
    const str = source.substring(lastPos, token.start);
    if (str.length > 0) {
      spans.push({
        kind: "whitespace",
        text: str,
      });
    }
    const text = source.substring(token.start, token.end);
    const kind = isFunction(text) ? "function-name" : mapTokenType(token);
    spans.push({ kind, text });
    lastPos = token.end;
  });
  const tail = source.substring(lastPos);
  if (tail.length > 0) {
    spans.push({
      kind: "whitespace",
      text: tail,
    });
  }
  return spans;
}

export default class TokenizedExpression extends React.Component {
  render() {
    const { source, startRule } = this.props;
    const spans = createSpans(source);
    return (
      <span className={cx(`Expression-node`, `Expression-${startRule}`)}>
        {spans.map(({ kind, text }, index) => (
          <span
            key={index}
            className={cx(`Expression-node`, `Expression-${kind}`)}
          >
            {text}
          </span>
        ))}
      </span>
    );
  }
}
