import React, { Component } from "react";
import PropTypes from "prop-types";
import { t } from "c-3po";
import ActionButton from "metabase/components/ActionButton.jsx";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper.jsx";
import ModalContent from "metabase/components/ModalContent.jsx";

import moment from "moment";

function formatDate(date) {
  let m = moment(date);
  if (m.isSame(moment(), "day")) {
    return t`Today, ` + m.format("h:mm a");
  } else if (m.isSame(moment().subtract(1, "day"), "day")) {
    return t`Yesterday, ` + m.format("h:mm a");
  } else {
    return m.format("MMM D YYYY, h:mm a");
  }
}

export default class HistoryModal extends Component {
  constructor(props, context) {
    super(props, context);

    this.state = {
      error: null,
    };
  }

  static propTypes = {
    revisions: PropTypes.array,
    entityType: PropTypes.string.isRequired,
    entityId: PropTypes.number.isRequired,

    onFetchRevisions: PropTypes.func.isRequired,
    onRevertToRevision: PropTypes.func.isRequired,
    onClose: PropTypes.func.isRequired,
    onReverted: PropTypes.func.isRequired,
  };

  async componentDidMount() {
    let { entityType, entityId } = this.props;

    try {
      await this.props.onFetchRevisions({ entity: entityType, id: entityId });
    } catch (error) {
      this.setState({ error: error });
    }
  }

  async revert(revision) {
    let { entityType, entityId } = this.props;
    try {
      await this.props.onRevertToRevision({
        entity: entityType,
        id: entityId,
        revision_id: revision.id,
      });
      this.props.onReverted();
    } catch (e) {
      console.warn("revert failed", e);
      throw e;
    }
  }

  revisionDescription(revision) {
    if (revision.is_creation) {
      return t`First revision.`;
    } else if (revision.is_reversion) {
      return t`Reverted to an earlier revision and ${revision.description}`;
    } else {
      return revision.description;
    }
  }

  render() {
    const { revisions } = this.props;
    const cellClassName = "p1 border-bottom";

    return (
      <ModalContent
        title={t`Revision history`}
        onClose={() => this.props.onClose()}
      >
        <LoadingAndErrorWrapper loading={!revisions} error={this.state.error}>
          {() => (
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
                {revisions.map((revision, index) => (
                  <tr key={revision.id}>
                    <td className={cellClassName}>
                      {formatDate(revision.timestamp)}
                    </td>
                    <td className={cellClassName}>
                      {revision.user.common_name}
                    </td>
                    <td className={cellClassName}>
                      <span>{this.revisionDescription(revision)}</span>
                    </td>
                    <td className={cellClassName}>
                      {index !== 0 && (
                        <ActionButton
                          actionFn={() => this.revert(revision)}
                          className="Button Button--small Button--danger text-uppercase"
                          normalText={t`Revert`}
                          activeText={t`Reverting…`}
                          failedText={t`Revert failed`}
                          successText={t`Reverted`}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </LoadingAndErrorWrapper>
      </ModalContent>
    );
  }
}
