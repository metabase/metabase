import React from "react";

import "./TokenizedExpression.css";

import cx from "classnames";

import { parse } from "metabase/lib/expressions/syntax";

export default class TokenizedExpression extends React.Component {
  static defaultProps = {
    parse: parse,
  };

  render() {
    const { parse, source, parserInfo } = this.props;
    try {
      const parsed = parse(source, parserInfo);
      return renderSyntaxTree(parsed);
    } catch (e) {
      console.warn("parse error", e);
      return <span className="Expression-node">{source}</span>;
    }
  }
}

const renderSyntaxTree = (node, index) => (
  <span
    key={index}
    style={{ fontSize: "12px" }}
    className={cx("Expression-node text-monospace", "Expression-" + node.type, {
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
