"use strict";

import React, { Component, PropTypes } from "react";

import ActionButton from "metabase/components/ActionButton.react";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper.react";
import ModalContent from "metabase/components/ModalContent.react";

import moment from "moment";

function formatDate(date) {
    var m = moment(date);
    if (m.isSame(moment(), 'day')) {
        return "Today, " + m.format("h:mm a");
    } else if (m.isSame(moment().subtract(1, "day"), "day")) {
        return "Yesterday, " + m.format("h:mm a");
    } else {
        return m.format("MMM D YYYY, h:mm a");
    }
}

export default class HistoryModal extends Component {
    constructor() {
        super();
        this.state = { error: null };
    }

    async componentDidMount() {
        let { entityType, entityId } = this.props;

        // HACK: close if opened with null entityId to work around issue with modals mysteriously opening
        // https://github.com/metabase/metabase-init/issues/917
        if (entityId == null) {
            this.props.onClose();
            return;
        }

        try {
            await this.props.onFetchRevisions({ entity: entityType, id: entityId });
        } catch (error) {
            this.setState({ error: error });
        }
    }

    async revert(revision) {
        let { entityType, entityId } = this.props;
        try {
            await this.props.onRevertToRevision({ entity: entityType, id: entityId, revision_id: revision.id });
            this.props.onReverted();
        } catch (e) {
            console.warn("revert failed", e);
            throw e;
        }
    }

    render() {
        var { revisions } = this.props;
        return (
            <ModalContent
                title="Change History"
                closeFn={() => this.props.onClose()}
            >
                <LoadingAndErrorWrapper loading={!revisions} error={this.state.error}>
                {() =>
                    <div className="pb4 flex-full">
                        <div className="border-bottom flex px4 py1 text-uppercase text-grey-3 text-bold h5">
                            <span className="flex-half">When</span>
                            <span className="flex-half">Who</span>
                            <span className="flex-full">What</span>
                        </div>
                        <div className="px2 scroll-y">
                            {revisions.map((revision, index) =>
                                <div key={revision.id} className="border-row-divider flex py1 px2">
                                    <span className="flex-half">{formatDate(revision.timestamp)}</span>
                                    <span className="flex-half">{revision.user.common_name}</span>
                                    <span className="flex-full flex">
                                        <span>{revision.description}</span>
                                        {index !== 0 ?
                                            <div className="flex-align-right pl1">
                                                <ActionButton
                                                    actionFn={() => this.revert(revision)}
                                                    className="Button Button--small Button--danger text-uppercase"
                                                    normalText="Revert"
                                                    activeText="Reverting…"
                                                    failedText="Revert failed"
                                                    successText="Reverted"
                                                />
                                            </div>
                                        : null}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                }
                </LoadingAndErrorWrapper>
            </ModalContent>
        );
    }
}

HistoryModal.propTypes = {
    revisions: PropTypes.array,
    entityType: PropTypes.string.isRequired,
    entityId: PropTypes.number.isRequired,
    onFetchRevisions: PropTypes.func.isRequired,
    onRevertToRevision: PropTypes.func.isRequired,
    onClose: PropTypes.func.isRequired,
    onReverted: PropTypes.func.isRequired
};
