import React from "react";

import ExpressionEditorTextfield from "./expressions/ExpressionEditorTextfield";
import Button from "metabase/components/Button";

import { t } from "ttag";
import Icon from "metabase/components/Icon";

// TODO: combine with ExpressionWidget
export default class ExpressionPopover extends React.Component {
  state = {
    error: null,
    isValid: false,
  };

  render() {
    const {
      title,
      startRule,
      query,
      expression,
      onChange,
      onBack,
      onDone,
      name,
      onChangeName,
    } = this.props;
    const { error, isValid } = this.state;

    const buttonEnabled = !error && isValid && (!onChangeName || name);

    // if onChangeName is provided then a name is required
    return (
      <div style={{ width: 498 }}>
        <div className="text-medium p1 py2 border-bottom flex align-center">
          <a className="cursor-pointer flex align-center" onClick={onBack}>
            <Icon name="chevronleft" size={18} />
            <h3 className="inline-block pl1">{title}</h3>
          </a>
        </div>
        <div className="p1">
          <ExpressionEditorTextfield
            startRule={startRule}
            expression={expression}
            query={query}
            onChange={expression => {
              onChange(expression);
              this.setState({ error: null });
            }}
            onError={errorMessage => {
              this.setState({ error: errorMessage });
            }}
            onCommit={expression => {
              if (!onChangeName) {
                onChange(expression);
                onDone();
              }
            }}
            onValidChange={newValid => {
              this.setState({ isValid: newValid });
            }}
          />
          {onChangeName && (
            <input
              className="input block full my1"
              value={name}
              onChange={e => onChangeName(e.target.value)}
              onKeyPress={e => {
                if (e.key === "Enter" && buttonEnabled) {
                  onDone();
                }
              }}
              placeholder={t`Name (required)`}
            />
          )}
          <Button
            className="full"
            primary
            disabled={!buttonEnabled}
            onClick={onDone}
          >
            {t`Done`}
          </Button>
        </div>
      </div>
    );
  }
}
