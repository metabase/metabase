import React from "react";

import ExpressionEditorTextfield from "./expressions/ExpressionEditorTextfield";
import Button from "metabase/components/Button";

import { t } from "ttag";
import Icon from "metabase/components/Icon";

import "./ExpressionPopover.css";

// TODO: combine with ExpressionWidget
export default class ExpressionPopover extends React.Component {
  state = {
    error: null,
  };

  render() {
    const {
      title,
      startRule,
      query,
      expression,
      onChange,
      onDone,
      onBack,
      name,
      onChangeName,
    } = this.props;
    const { error } = this.state;

    // if onChangeName is provided then a name is required
    const isValid = !error && (!onChangeName || name);

    return (
      <div className="ExpressionPopover">
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
                onDone(expression);
              }
            }}
          />
          {onChangeName && (
            <input
              className="input block full my1"
              value={name}
              onChange={e => onChangeName(e.target.value)}
              onKeyPress={e => {
                if (e.key === "Enter" && isValid) {
                  onDone(expression);
                }
              }}
              placeholder={t`Name (required)`}
            />
          )}
          <Button
            className="full"
            primary
            disabled={!isValid}
            onClick={() => onDone(expression)}
          >
            {t`Done`}
          </Button>
        </div>
      </div>
    );
  }
}
