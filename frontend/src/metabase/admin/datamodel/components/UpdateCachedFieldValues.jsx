import React from "react";

import { t } from "c-3po";

import ActionButton from "metabase/components/ActionButton.jsx";

export default class UpdateCachedFieldValues extends React.Component {
  render() {
    return (
      <div>
        <ActionButton
          className="Button mr2"
          actionFn={this.props.rescanFieldValues}
          normalText={t`Re-scan this field`}
          activeText={t`Starting…`}
          failedText={t`Failed to start scan`}
          successText={t`Scan triggered!`}
        />
        <ActionButton
          className="Button Button--danger"
          actionFn={this.props.discardFieldValues}
          normalText={t`Discard cached field values`}
          activeText={t`Starting…`}
          failedText={t`Failed to discard values`}
          successText={t`Discard triggered!`}
        />
      </div>
    );
  }
}
