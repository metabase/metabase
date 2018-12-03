import React from "react";

import "./TokenizedExpression.css";

import cx from "classnames";

export default class TokenizedExpression extends React.Component {
  render() {
    // TODO: use the Chevrotain parser or tokenizer
    // let parsed = parse(this.props.source, this.props.parserInfo);
    const parsed = parse(this.props.source);
    return renderSyntaxTree(parsed);
  }
}

const renderSyntaxTree = (node, index) => (
  <span
    key={index}
    className={cx("Expression-node", "Expression-" + node.type, {
      "Expression-tokenized": node.tokenized,
    })}
  >
    {node.text != null
      ? node.text
      : node.children ? node.children.map(renderSyntaxTree) : null}
  </span>
);

function nextNonWhitespace(tokens, index) {
  while (index < tokens.length && /^\s+$/.test(tokens[++index])) {
    // this block intentionally left blank
  }
  return tokens[index];
}

function parse(expressionString) {
  let tokens = (expressionString || " ").match(
    /[a-zA-Z]\w*|"(?:[^\\"]+|\\(?:[bfnrtv"\\/]|u[0-9a-fA-F]{4}))*"|\(|\)|\d+|\s+|[*/+-]|.+/g,
  );

  let root = { type: "group", children: [] };
  let current = root;
  let outsideAggregation = true;
  const stack = [];
  const push = element => {
    current.children.push(element);
    stack.push(current);
    current = element;
  };
  const pop = () => {
    if (stack.length === 0) {
      return;
    }
    current = stack.pop();
  };
  for (let i = 0; i < tokens.length; i++) {
    let token = tokens[i];
    if (/^[a-zA-Z]\w*$/.test(token)) {
      if (nextNonWhitespace(tokens, i) === "(") {
        outsideAggregation = false;
        push({
          type: "aggregation",
          tokenized: true,
          children: [],
        });
        current.children.push({
          type: "aggregation-name",
          text: token,
        });
      } else {
        current.children.push({
          type: outsideAggregation ? "metric" : "field",
          tokenized: true,
          text: token,
        });
      }
    } else if (
      /^"(?:[^\\"]+|\\(?:[bfnrtv"\\/]|u[0-9a-fA-F]{4}))*"$/.test(token)
    ) {
      current.children.push({
        type: "string-literal",
        tokenized: true,
        children: [
          { type: "open-quote", text: '"' },
          {
            type: outsideAggregation ? "metric" : "field",
            text: JSON.parse(token),
          },
          { type: "close-quote", text: '"' },
        ],
      });
    } else if (token === "(") {
      push({ type: "group", children: [] });
      current.children.push({ type: "open-paren", text: "(" });
    } else if (token === ")") {
      current.children.push({ type: "close-paren", text: ")" });
      pop();
      if (current.type === "aggregation") {
        outsideAggregation = true;
        pop();
      }
    } else {
      // special handling for unclosed string literals
      if (i === tokens.length - 1 && /^".+[^"]$/.test(token)) {
        current.children.push({
          type: "string-literal",
          tokenized: true,
          children: [
            { type: "open-quote", text: '"' },
            {
              type: outsideAggregation ? "metric" : "field",
              text: JSON.parse(token + '"'),
            },
          ],
        });
      } else {
        current.children.push({ type: "token", text: token });
      }
    }
  }
  return root;
}
