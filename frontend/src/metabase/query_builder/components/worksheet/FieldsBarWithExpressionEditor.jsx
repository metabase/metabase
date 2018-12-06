import React from "react";

import Icon from "metabase/components/Icon";
import Button from "metabase/components/Button";

import FieldsBar from "./FieldsBar";
import ExpressionEditorTextfield from "../expressions/ExpressionEditorTextfield";

export default class FieldsBarWithExpressionEditor extends React.Component {
  state = {
    expression: null,
    expressionName: "",
    isAdding: false,
    error: null,
  };
  add = () => {
    this.setState({
      isAdding: true,
      expression: null,
      expressionName: "",
      error: null,
    });
  };
  reset = () => {
    this.setState({
      isAdding: false,
      expression: null,
      expressionName: "",
      error: null,
    });
  };
  commit = () => {
    this.props.onAddExpression("foo", this.state.expression);
    this.reset();
  };
  render() {
    const { query } = this.props;
    const { isAdding, expression, expressionName, error } = this.state;
    return (
      <div>
        <FieldsBar
          {...this.props}
          onOpenPicker={isAdding ? null : this.props.onOpenPicker}
          alignButtonsRight={isAdding}
          extraButtons={
            isAdding ? (
              <input
                className="input input--small full-height flex-align-right"
                value={expressionName}
                placeholder={`Name it`}
                onChange={e =>
                  this.setState({ expressionName: e.target.value })
                }
              />
            ) : (
              <Icon
                name="add"
                className="mx1 px1 cursor-pointer text-brand"
                size={20}
                onClick={this.add}
              />
            )
          }
        />
        {isAdding && (
          <div className="relative">
            <ExpressionEditorTextfield
              className="bg-white"
              expression={expression}
              tableMetadata={query.tableMetadata()}
              onChange={parsedExpression =>
                this.setState({ expression: parsedExpression, error: null })
              }
              onError={errorMessage => this.setState({ error: errorMessage })}
            />
            <div className="absolute top bottom right flex align-center">
              <Icon
                name="close"
                className="mx1 text-medium cursor-pointer"
                onClick={this.reset}
              />
              <Button
                primary
                medium
                icon="check"
                className="mx1"
                disabled={!expressionName || !expression || error}
                onClick={this.commit}
              />
            </div>
          </div>
        )}
        {error && <div className="text-error">{error}</div>}
      </div>
    );
  }
}
