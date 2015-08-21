"use strict";

import ActionButton from "metabase/components/ActionButton.react";
import Header from "metabase/components/Header.react";
import Icon from "metabase/components/Icon.react";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger.react";
import AddToDashSelectQuestionModal from ".//AddToDashSelectQuestionModal.react";

import {
    saveDashboard,
    setEditingDashboard,
    fetchDashboard,
    setDashboardAttributes
} from '../actions';

export default class DashboardHeader extends React.Component {

    async onSaveDashboard() {
        await this.props.dispatch(saveDashboard(this.props.dashboard.id));
        this.props.dispatch(setEditingDashboard(false));
    }

    onEditDashboard() {
        this.props.dispatch(setEditingDashboard(true))
    }

    onRevertDashboard() {
        this.props.dispatch(fetchDashboard(this.props.dashboard.id));
    }

    onDashboardAttributeChange(attribute, value) {
        this.props.dispatch(setDashboardAttributes({
            id: this.props.dashboard.id,
            attributes: { [attribute]: value }
        }));
    }

    getEditingButtons() {
        var editingButtons = [];
        if (this.props.isDirty) {
        // if (this.state.recentlySaved === "updated" || (this.props.cardIsDirtyFn() && this.props.card.is_creator)) {
            editingButtons.push(
                <ActionButton
                    actionFn={() => this.onSaveDashboard()}
                    className='Button Button--small Button--primary text-uppercase'
                    normalText="Update"
                    activeText="Updating…"
                    failedText="Update failed"
                    successText="Updated"
                />
            );
        // }
        // if (this.props.cardIsDirtyFn()) {
            editingButtons.push(
                <a className="Button Button--small text-uppercase" href="#" onClick={() => this.onRevertDashboard()}>Discard Changes</a>
            );
        // }
        }
        editingButtons.push(
            <PopoverWithTrigger
                ref="deleteModal"
                tether={false}
                triggerClasses="Button Button--small text-uppercase"
                triggerElement="Delete"
            >
            </PopoverWithTrigger>
        );
        return editingButtons;
    }

    getHeaderButtons() {
        var buttonSections = [];

        var { dashboard, dashcards } = this.props;

        if (dashboard && dashboard.can_write && !this.props.isEditing) {
            buttonSections.push([
                <a title="Edit Dashboard Layout" className="text-brand-hover" onClick={() => this.onEditDashboard()}>
                    <Icon name="pencil" width="16px" height="16px" />
                </a>
            ]);
        }

        // buttonSections.push([
        //     <a title="Add Question to Dashboard" className="text-brand-hover" onClick={() => this.addQuestion()}>
        //         <Icon name="add" width="16px" height="16px" />
        //     </a>
        // ]);
        buttonSections.push([
            <PopoverWithTrigger
                ref="addQuestionModal"
                tether={false}
                triggerElement={<Icon name="add" width="16px" height="16px" />}
            >
                <AddToDashSelectQuestionModal
                    dispatch={this.props.dispatch}
                    dashboard={dashboard}
                    cards={this.props.cards}
                    closeFn={() => this.refs.addQuestionModal.toggleModal()}
                />
            </PopoverWithTrigger>
        ])

        return buttonSections;
    }

    render() {
        var { dashboard, dashcards } = this.props;

        return (
            <Header
                objectType="dashboard"
                item={dashboard}
                isEditing={this.props.isEditing}
                isEditingInfo={this.props.isEditing}
                headerButtons={this.getHeaderButtons()}
                editingTitle="You are editing a dashboard"
                editingButtons={this.getEditingButtons()}
                setItemAttributeFn={this.onDashboardAttributeChange.bind(this)}
            >
            </Header>
        );
    }
}

DashboardHeader.propTypes = {
    dispatch: React.PropTypes.func.isRequired,
    isEditing: React.PropTypes.bool.isRequired,
    dashboard: React.PropTypes.object.isRequired
};
