import React, { Component } from "react";
import PropTypes from "prop-types";
import cx from "classnames";
import _ from "underscore";
import { t } from "c-3po";
import ExpressionEditorTextfield from "./ExpressionEditorTextfield.jsx";
import { isExpression } from "metabase/lib/expressions";

export default class ExpressionWidget extends Component {
  static propTypes = {
    expression: PropTypes.array,
    name: PropTypes.string,
    tableMetadata: PropTypes.object.isRequired,
    onSetExpression: PropTypes.func.isRequired,
    onRemoveExpression: PropTypes.func.isRequired,
    onCancel: PropTypes.func.isRequired,
  };

  static defaultProps = {
    expression: null,
    name: "",
  };

  componentWillMount() {
    this.componentWillReceiveProps(this.props);
  }

  componentWillReceiveProps(newProps) {
    this.setState({
      name: newProps.name,
      expression: newProps.expression,
    });
  }

  isValid() {
    const { name, expression, error } = this.state;
    return !_.isEmpty(name) && !error && isExpression(expression);
  }

  render() {
    const { expression } = this.state;

    return (
      <div style={{ maxWidth: "600px" }}>
        <div className="p2">
          <div className="h5 text-uppercase text-medium text-bold">{t`Field formula`}</div>
          <div>
            <ExpressionEditorTextfield
              expression={expression}
              tableMetadata={this.props.tableMetadata}
              onChange={parsedExpression =>
                this.setState({ expression: parsedExpression, error: null })
              }
              onError={errorMessage => this.setState({ error: errorMessage })}
            />
            <p className="h5 text-medium">
              {t`Think of this as being kind of like writing a formula in a spreadsheet program: you can use numbers, fields in this table, mathematical symbols like +, and some functions. So you could type something like Subtotal - Cost.`}
              &nbsp;<a
                className="link"
                target="_blank"
                href="http://www.metabase.com/docs/latest/users-guide/04-asking-questions.html#creating-a-custom-field"
              >{t`Learn more`}</a>
            </p>
          </div>

          <div className="mt3 h5 text-uppercase text-medium text-bold">{t`Give it a name`}</div>
          <div>
            <input
              className="my1 input block full"
              type="text"
              value={this.state.name}
              placeholder={t`Something nice and descriptive`}
              onChange={event => this.setState({ name: event.target.value })}
            />
          </div>
        </div>

        <div className="mt2 p2 border-top flex flex-row align-center justify-between">
          <div className="ml-auto">
            <button
              className="Button"
              onClick={() => this.props.onCancel()}
            >{t`Cancel`}</button>
            <button
              className={cx("Button ml2", {
                "Button--primary": this.isValid(),
              })}
              onClick={() =>
                this.props.onSetExpression(
                  this.state.name,
                  this.state.expression,
                )
              }
              disabled={!this.isValid()}
            >
              {this.props.expression ? t`Update` : t`Done`}
            </button>
          </div>
          <div>
            {this.props.expression ? (
              <a
                className="pr2 ml2 text-error link"
                onClick={() => this.props.onRemoveExpression(this.props.name)}
              >{t`Remove`}</a>
            ) : null}
          </div>
        </div>
      </div>
    );
  }
}
