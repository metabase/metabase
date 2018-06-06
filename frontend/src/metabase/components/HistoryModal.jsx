import React, { Component } from "react";
import PropTypes from "prop-types";
import { t } from "c-3po";
import ActionButton from "metabase/components/ActionButton.jsx";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper.jsx";
import ModalContent from "metabase/components/ModalContent.jsx";
import { RevisionApi } from "metabase/services";

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

  state = {
    error: null,
    revisions: []
  };

  static propTypes = {
    revisions: PropTypes.array,
    entityType: PropTypes.string.isRequired,
    entityId: PropTypes.number.isRequired,

    onClose: PropTypes.func.isRequired,
  };

  onFetchRevisions = async ({ entity, id }) => {
    // TODO: reduxify
    let revisions = await RevisionApi.list({ entity, id });
    this.setState({ revisions });
  }

  onRevertToRevision = async({ entity, id, revision_id }) => {
    // TODO: reduxify
    return RevisionApi.revert({ entity, id, revision_id });
  }

  onReverted () {

  }

  async componentDidMount() {
    let { entityType, entityId } = this.props;

    try {
      await this.onFetchRevisions({ entity: entityType, id: parseInt(entityId) });
    } catch (error) {
      this.setState({ error: error });
    }
  }

  async revert(revision) {
    let { entityType, entityId } = this.props;
    try {
      await this.onRevertToRevision({
        entity: entityType,
        id: entityId,
        revision_id: revision.id,
      });
      this.onReverted();
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
    const { revisions, error } = this.state;
    return (
      <ModalContent
        title={t`Revision history`}
        onClose={() => this.props.onClose()}
      >
        <LoadingAndErrorWrapper
          loading={!revisions}
          error={error}
        >
          {() => (
            <table>
              <thead className="border-bottom py1 text-uppercase text-grey-3 text-bold h5">
                <th>{t`When`}</th>
                <th>{t`Who`}</th>
                <th>{t`What`}</th>
              </thead>
              <tbody className=" scroll-y">
                {revisions.map((revision, index) => (
                  <tr
                    key={revision.id}
                    className="border-row-divider"
                  >
                    <td>
                      {formatDate(revision.timestamp)}
                    </td>
                    <td>
                      {revision.user.common_name}
                    </td>
                    <td>
                      <span>{this.revisionDescription(revision)}</span>
                      {index !== 0 ? (
                        <div className="flex-align-right pl1">
                          <ActionButton
                            actionFn={() => this.revert(revision)}
                            className="Button Button--small Button--danger text-uppercase"
                            normalText={t`Revert`}
                            activeText={t`Reverting…`}
                            failedText={t`Revert failed`}
                            successText={t`Reverted`}
                          />
                        </div>
                      ) : null}
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
