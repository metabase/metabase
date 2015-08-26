'use strict';

import ModalBody from "metabase/components/ModalBody.react";
import Toggle from 'metabase/components/Toggle.react';
import SortableItemList from 'metabase/components/SortableItemList.react';

import { removeCardFromDashboard, deleteCard } from '../actions';

import moment from 'moment';

export default class RemoveFromDashboardModal extends React.Component {
    constructor() {
        super();
        this.state = { deleteCard: false };
    }

    onRemove() {
        this.props.dispatch(removeCardFromDashboard({
            dashId: this.props.dashboard.id,
            dashcardId: this.props.dashcard.id
        }));
        if (this.state.deleteCard) {
            // this.props.dispatch(deleteCard(this.props.dashcard.card_id))
            // this.props.dispatch(markCardForDeletion(this.props.dashcard.card_id))
        }
        this.props.onClose();
    }

    render() {
        var removeWarning;
        if (this.state.deleteCard) {
            removeWarning = (
                <div>
                    <p>It will be removed from:</p>
                    <ul>
                        <li></li>
                    </ul>
                </div>
            )
        }

        var deleteCardOption;
        if (this.props.enableDeleteCardOption) {
            deleteCardOption = (
                <div className="flex pt1">
                    <Toggle className="text-warning mr2 mt1" value={this.state.deleteCard} onChange={() => this.setState({ deleteCard: !this.state.deleteCard })}/>
                    <div>
                        <p>Also delete this question from Metabase</p>
                        {removeWarning}
                    </div>
                </div>
            );
        }

        return (
            <ModalBody
                title="Remove from Dashboard"
                closeFn={() => this.props.onClose()}
            >
                <div className="px4 pb3 text-grey-4">
                    <p>Are you sure you want to do this?</p>
                    {deleteCardOption}
                </div>

                <div className="Form-actions">
                    <button className="Button Button--danger" onClick={() => this.onRemove()}>Yes</button>
                    <button className="Button Button--primary ml1" onClick={this.props.onClose}>No</button>
                </div>
            </ModalBody>
        );
    }
}

RemoveFromDashboardModal.propTypes = {
    dispatch: React.PropTypes.func.isRequired,
    dashcard: React.PropTypes.object.isRequired,
    dashboard: React.PropTypes.object.isRequired,
    onClose: React.PropTypes.func.isRequired
};
