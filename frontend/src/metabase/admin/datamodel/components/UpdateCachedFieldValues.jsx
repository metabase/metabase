/* eslint-disable react/prop-types */
import React from "react";

import { t } from "ttag";

import ActionButton from "metabase/components/ActionButton";

export default class UpdateCachedFieldValues extends React.Component {
  render() {
    return (
      <div>
        <ActionButton
          className="Button mr2"
          actionFn={this.props.rescanFieldValues}
          normalText={t`Re-sync this field`}
          activeText={t`Starting…`}
          failedText={t`Failed to start sync`}
          successText={t`Sync triggered!`}
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
