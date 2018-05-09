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
    let { revisions } = this.props;
    return (
      <ModalContent
        title={t`Revision history`}
        onClose={() => this.props.onClose()}
      >
        <LoadingAndErrorWrapper
          className="flex flex-full flex-basis-auto"
          loading={!revisions}
          error={this.state.error}
        >
          {() => (
            <div className="pb4 flex-full">
              <div className="border-bottom flex px4 py1 text-uppercase text-grey-3 text-bold h5">
                <span className="flex-half">{t`When`}</span>
                <span className="flex-half">{t`Who`}</span>
                <span className="flex-full">{t`What`}</span>
              </div>
              <div className="px2 scroll-y">
                {revisions.map((revision, index) => (
                  <div
                    key={revision.id}
                    className="border-row-divider flex py1 px2"
                  >
                    <span className="flex-half">
                      {formatDate(revision.timestamp)}
                    </span>
                    <span className="flex-half">
                      {revision.user.common_name}
                    </span>
                    <span className="flex-full flex">
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
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </LoadingAndErrorWrapper>
      </ModalContent>
    );
  }
}
