import React from "react";

import "./TokenizedExpression.css";

import cx from "classnames";

import { parse, parseFallback } from "metabase/lib/expressions/syntax";

export default class TokenizedExpression extends React.Component {
  render() {
    const parser = this.props.legacySyntax ? parseFallback : parse;
    try {
      const parsed = parser(this.props.source, this.props.parserInfo);
      return renderSyntaxTree(parsed);
    } catch (e) {
      console.warn("parse error", e);
      return <span className="Expression-node">{this.props.source}</span>;
    }
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
      : node.children
      ? node.children.map(renderSyntaxTree)
      : null}
  </span>
);
