import React, { Component } from "react";
import PropTypes from "prop-types";

import MetabaseAnalytics from "metabase/lib/analytics";
import ModalContent from "metabase/components/ModalContent.jsx";
import Toggle from 'metabase/components/Toggle.jsx';


export default class RemoveFromDashboardModal extends Component {
    constructor(props, context) {
        super(props, context);
        this.state = { deleteCard: false };
    }

    static propTypes = {
        dashcard: PropTypes.object.isRequired,
        dashboard: PropTypes.object.isRequired,
        removeCardFromDashboard: PropTypes.func.isRequired,
        onClose: PropTypes.func.isRequired
    };

    onRemove() {
        this.props.removeCardFromDashboard({
            dashId: this.props.dashboard.id,
            dashcardId: this.props.dashcard.id
        });
        if (this.state.deleteCard) {
            // this.props.dispatch(deleteCard(this.props.dashcard.card_id))
            // this.props.dispatch(markCardForDeletion(this.props.dashcard.card_id))
        }
        this.props.onClose();

        MetabaseAnalytics.trackEvent("Dashboard", "Remove Card");
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
            <ModalContent
                title="Remove this question?"
                onClose={() => this.props.onClose()}
            >

                <div className="Form-actions flex-align-right">
                    <button className="Button Button" onClick={this.props.onClose}>Cancel</button>
                    <button className="Button Button--danger ml2" onClick={() => this.onRemove()}>Remove</button>
                </div>
            </ModalContent>
        );
    }
}
