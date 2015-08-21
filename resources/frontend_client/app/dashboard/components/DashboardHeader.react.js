"use strict";

import React, { Component, PropTypes } from "react";

import ActionButton from "metabase/components/ActionButton.react";
import Header from "metabase/components/Header.react";
import Icon from "metabase/components/Icon.react";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger.react";
import AddToDashSelectQuestionModal from "./AddToDashSelectQuestionModal.react";
import DeleteDashboardModal from "./DeleteDashboardModal.react";
import HistoryModal from "./HistoryModal.react";

import {
    setEditingDashboard,
    fetchDashboard,
    setDashboardAttributes,
    saveDashboard,
    deleteDashboard
} from '../actions';

import cx from "classnames";

export default class DashboardHeader extends Component {

    onEditDashboard() {
        this.props.dispatch(setEditingDashboard(true))
    }

    onDashboardAttributeChange(attribute, value) {
        this.props.dispatch(setDashboardAttributes({
            id: this.props.dashboard.id,
            attributes: { [attribute]: value }
        }));
    }

    onRevertDashboard() {
        this.props.dispatch(fetchDashboard(this.props.dashboard.id));
    }

    async onSaveDashboard() {
        await this.props.dispatch(saveDashboard(this.props.dashboard.id));
        this.props.dispatch(setEditingDashboard(false));
    }

    async onDeleteDashboard() {
        await this.props.dispatch(deleteDashboard(this.props.dashboard.id));
        this.props.onDashboardDeleted(this.props.dashboard.id)
        this.props.onChangeLocation("/")
    }

    onRevertedRevision() {
        this.refs.dashboardHistory.toggleModal();
        this.props.dispatch(fetchDashboard(this.props.dashboard.id));
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
                ref="deleteDashboardModal"
                tether={false}
                triggerClasses="Button Button--small text-uppercase"
                triggerElement="Delete"
            >
                <DeleteDashboardModal
                    dispatch={this.props.dispatch}
                    dashboard={this.props.dashboard}
                    onClose={() => this.refs.deleteDashboardModal.toggleModal()}
                    onDelete={() => this.onDeleteDashboard()}
                />
            </PopoverWithTrigger>
        );
        return editingButtons;
    }

    getHeaderButtons() {
        var buttonSections = [];

        var { dashboard, dashcards } = this.props;

        if (this.props.isEditing) {
            buttonSections.push([
                <PopoverWithTrigger
                    ref="dashboardHistory"
                    tether={false}
                    triggerElement={<Icon name="history" width="16px" height="16px" />}
                >
                    <HistoryModal
                        dispatch={this.props.dispatch}
                        entityType="dashboard"
                        entityId={dashboard.id}
                        revisions={this.props.revisions}
                        onClose={() => this.refs.dashboardHistory.toggleModal()}
                        onReverted={() => this.onRevertedRevision()}
                    />
                </PopoverWithTrigger>
            ]);
        }

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

        var isEmpty = dashboard.ordered_cards.length === 0;
        buttonSections.push([
            <PopoverWithTrigger
                ref="addQuestionModal"
                tether={false}
                triggerElement={<Icon className={cx({ "Icon--pulse": isEmpty })} name="add" width="16px" height="16px" />}
            >
                <AddToDashSelectQuestionModal
                    dispatch={this.props.dispatch}
                    dashboard={dashboard}
                    cards={this.props.cards}
                    onClose={() => this.refs.addQuestionModal.toggleModal()}
                />
            </PopoverWithTrigger>
        ]);

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
    dispatch: PropTypes.func.isRequired,
    isEditing: PropTypes.bool.isRequired,
    dashboard: PropTypes.object.isRequired,
    revisions: PropTypes.object.isRequired
};
