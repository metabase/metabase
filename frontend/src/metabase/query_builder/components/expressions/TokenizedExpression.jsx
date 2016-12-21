import React, { Component, PropTypes } from "react";

import "./TokenizedExpression.css";

function nextNonWhitespace(tokens, index) {
    while (index < tokens.length && /^\s+$/.test(tokens[++index])) {
    }
    return tokens[index];
}

export default class TokenizedExpression extends React.Component {
    render() {
        // TODO: use the Chevrotain parser or tokenizer
        let tokens = this.props.source.match(/[a-zA-Z]\w*|"(?:[^\\"]+|\\(?:[bfnrtv"\\/]|u[0-9a-fA-F]{4}))*"|\(|\)|\d+|\s+|[*/+-]|.*/g);
        let root = <span className="TokenizedExpression" children={[]} />;
        let current = root;
        let outsideAggregation = true;
        const stack = [];
        const push = (element) => {
            current.props.children.push(element);
            stack.push(current);
            current = element;
        }
        const pop = () => {
            if (stack.length === 0) {
                return;
            }
            current = stack.pop();
        }
        for (let i = 0; i < tokens.length; i++) {
            let token = tokens[i];
            if (/^[a-zA-Z]\w*$/.test(token)) {
                if (nextNonWhitespace(tokens, i) === "(") {
                    outsideAggregation = false;
                    push(<span className="aggregation" children={[]} />);
                    current.props.children.push(<span className="aggregation-name">{token}</span>);
                } else {
                    current.props.children.push(<span className="identifier">{token}</span>);
                }
            } else if (/^"(?:[^\\"]+|\\(?:[bfnrtv"\\/]|u[0-9a-fA-F]{4}))*"$/.test(token)) {
                current.props.children.push(
                    <span className="string-literal"><span className="open-quote">"</span><span className="identifier">{JSON.parse(token)}</span><span className="close-quote">"</span></span>
                );
            } else if (token === "(") {
                push(<span className="group" children={[]} />)
                current.props.children.push(<span className="open-paren">(</span>)
            } else if (token === ")") {
                current.props.children.push(<span className="close-paren">)</span>)
                pop();
                if (current.props.className === "aggregation") {
                    outsideAggregation = true;
                    pop();
                }
            } else {
                current.props.children.push(token);
            }
        }
        return root;
    }
}
