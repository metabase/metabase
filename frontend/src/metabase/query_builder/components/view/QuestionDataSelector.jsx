import React from "react";

import { DatabaseSchemaAndTableDataSelector } from "metabase/query_builder/components/DataSelector";

import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import Icon from "metabase/components/Icon";

export default class QuestionDataSelector extends React.Component {
  state = {
    isShowingSavedQuestions: false,
  };
  render() {
    const { query, triggerElement } = this.props;
    return this.state.isShowingSavedQuestions ? (
      <PopoverWithTrigger triggerElement={triggerElement} isOpen>
        <div style={{ width: 400 }}>
          <div>
            <span
              onClick={() => this.setState({ isShowingSavedQuestions: false })}
              className="text-brand-hover flex align-center"
            >
              <Icon name="chevronleft" />
              Back
            </span>
          </div>
          Saved questions go here
        </div>
      </PopoverWithTrigger>
    ) : (
      <DatabaseSchemaAndTableDataSelector
        // Set this to false for now so we use our own trigger and component instead
        databaseQuery={{ saved: false }}
        selectedDatabaseId={query.databaseId()}
        selectedTableId={query.tableId()}
        setSourceTableFn={tableId =>
          query
            .setTableId(tableId)
            .setDefaultQuery()
            .update(null, { run: true })
        }
        triggerElement={triggerElement}
        isOpen
        onSwitchToSavedQuestions={() =>
          this.setState({ isShowingSavedQuestions: true })
        }
      />
    );
  }
}
