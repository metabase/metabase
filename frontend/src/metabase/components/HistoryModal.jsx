import React, { Component } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import ActionButton from "metabase/components/ActionButton";
import ModalContent from "metabase/components/ModalContent";

import moment from "moment";

function formatDate(date) {
  const m = moment(date);
  if (m.isSame(moment(), "day")) {
    return t`Today, ` + m.format("h:mm a");
  } else if (m.isSame(moment().subtract(1, "day"), "day")) {
    return t`Yesterday, ` + m.format("h:mm a");
  } else {
    return m.format("MMM D YYYY, h:mm a");
  }
}

export default class HistoryModal extends Component {
  static propTypes = {
    revisions: PropTypes.array,
    onRevert: PropTypes.func,
    onClose: PropTypes.func.isRequired,
  };

  getRevisionDescription(revision) {
    if (revision.is_creation) {
      return t`First revision.`;
    } else if (revision.is_reversion) {
      return t`Reverted to an earlier revision and ${revision.description}`;
    } else {
      return revision.description;
    }
  }

  shouldRenderRevertButton(onRevert, hasSkippedMostRecentRevisionRevertButton) {
    return onRevert && hasSkippedMostRecentRevisionRevertButton
  }

  render() {
    const { revisions, onRevert, onClose } = this.props;
    const cellClassName = "p1 border-bottom";

    // We must keep track of having skipped the Revert button
    // because we are omitting revision entries that
    // don't have descriptions.
    // They may be the very top entry so we have to use dedicated logic.
    let hasSkippedMostRecentRevisionRevertButton = false

    return (
      <ModalContent title={t`Revision history`} onClose={onClose}>
        <table className="full">
          <thead>
            <tr>
              <th className={cellClassName}>{t`When`}</th>
              <th className={cellClassName}>{t`Who`}</th>
              <th className={cellClassName}>{t`What`}</th>
              <th className={cellClassName} />
            </tr>
          </thead>
          <tbody>
            {revisions.map((revision, index) => {
              const revisionDescription = this.getRevisionDescription(revision);

              if (revisionDescription) {
                const shouldRenderActionButton = this.shouldRenderRevertButton(onRevert, hasSkippedMostRecentRevisionRevertButton);
                hasSkippedMostRecentRevisionRevertButton = true;

                return (
                  <tr key={revision.id}>
                    <td className={cellClassName}>
                      {formatDate(revision.timestamp)}
                    </td>
                    <td className={cellClassName}>
                      {revision.user.common_name}
                    </td>
                    <td className={cellClassName}>
                      <span>{revisionDescription}</span>
                    </td>
                    <td className={cellClassName}>
                      {shouldRenderActionButton && (
                        <ActionButton
                          actionFn={() => onRevert(revision)}
                          className="Button Button--small Button--danger text-uppercase"
                          normalText={t`Revert`}
                          activeText={t`Reverting…`}
                          failedText={t`Revert failed`}
                          successText={t`Reverted`}
                        />
                      )}
                    </td>
                  </tr>
                );
              }
            })}
          </tbody>
        </table>
      </ModalContent>
    );
  }
}
