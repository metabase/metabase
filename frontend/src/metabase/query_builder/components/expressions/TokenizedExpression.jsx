/* eslint-disable react/prop-types */
import React from "react";

import "./TokenizedExpression.css";

import cx from "classnames";

export default class TokenizedExpression extends React.Component {
  render() {
    const { syntaxTree, source } = this.props;
    if (syntaxTree) {
      return renderSyntaxTree(syntaxTree);
    } else {
      if (source && source.length > 0) {
        return <span className="Expression-node">{source}</span>;
      } else {
        // <br> is inserted to workaround Firefox caret position issue
        return (
          <span className="Expression-node">
            <br />
          </span>
        );
      }
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
