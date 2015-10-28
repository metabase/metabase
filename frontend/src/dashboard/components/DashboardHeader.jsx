import React, { Component, PropTypes } from "react";

import ActionButton from "metabase/components/ActionButton.jsx";
import AddToDashSelectQuestionModal from "./AddToDashSelectQuestionModal.jsx";
import DeleteDashboardModal from "./DeleteDashboardModal.jsx";
import Header from "metabase/components/Header.jsx";
import HistoryModal from "metabase/components/HistoryModal.jsx";
import Icon from "metabase/components/Icon.jsx";
import ModalWithTrigger from "metabase/components/ModalWithTrigger.jsx";

import {
    setEditingDashboard,
    fetchDashboard,
    setDashboardAttributes,
    saveDashboard,
    deleteDashboard,
    fetchRevisions,
    revertToRevision
} from '../actions';

import cx from "classnames";

export default class DashboardHeader extends Component {
    static propTypes = {
        dispatch: PropTypes.func.isRequired,
        isEditing: PropTypes.bool.isRequired,
        dashboard: PropTypes.object.isRequired,
        revisions: PropTypes.object.isRequired
    };

    onEdit() {
        this.props.dispatch(setEditingDashboard(true))
    }

    onDoneEditing() {
        this.props.dispatch(setEditingDashboard(false));
    }

    onRevert() {
        this.props.dispatch(fetchDashboard(this.props.dashboard.id));
    }

    onAttributeChange(attribute, value) {
        this.props.dispatch(setDashboardAttributes({
            id: this.props.dashboard.id,
            attributes: { [attribute]: value }
        }));
    }

    async onSave() {
        await this.props.dispatch(saveDashboard(this.props.dashboard.id));
        this.onDoneEditing();
    }

    async onCancel() {
        this.onRevert();
        this.onDoneEditing();
    }

    async onDelete() {
        await this.props.dispatch(deleteDashboard(this.props.dashboard.id));
        this.props.onDashboardDeleted(this.props.dashboard.id)
        this.props.onChangeLocation("/")
    }

    // 1. fetch revisions
    onFetchRevisions({ entity, id }) {
        return this.props.dispatch(fetchRevisions({ entity, id }));
    }

    // 2. revert to a revision
    onRevertToRevision({ entity, id, revision_id }) {
        return this.props.dispatch(revertToRevision({ entity, id, revision_id }));
    }

    // 3. finished reverting to a revision
    onRevertedRevision() {
        this.refs.dashboardHistory.toggle();
        this.props.dispatch(fetchDashboard(this.props.dashboard.id));
    }

    getEditingButtons() {
        var editingButtons = [];
        editingButtons.push(
            <ActionButton
                actionFn={() => this.onSave()}
                className="Button Button--small Button--primary text-uppercase"
                normalText="Save"
                activeText="Saving…"
                failedText="Save failed"
                successText="Saved"
            />
        );
        editingButtons.push(
            <a className="Button Button--small text-uppercase" href="#" onClick={() => this.onCancel()}>Cancel</a>
        );
        editingButtons.push(
            <ModalWithTrigger
                ref="deleteDashboardModal"
                triggerClasses="Button Button--small text-uppercase"
                triggerElement="Delete"
            >
                <DeleteDashboardModal
                    dispatch={this.props.dispatch}
                    dashboard={this.props.dashboard}
                    onClose={() => this.refs.deleteDashboardModal.toggle()}
                    onDelete={() => this.onDelete()}
                />
            </ModalWithTrigger>
        );
        return editingButtons;
    }

    getHeaderButtons() {
        var buttonSections = [];

        var { dashboard, isEditing, isFullscreen } = this.props;

        if (isEditing) {
            buttonSections.push([
                <ModalWithTrigger
                    ref="dashboardHistory"
                    triggerElement={<Icon className="text-brand-hover" name="history" width="16px" height="16px" />}
                >
                    <HistoryModal
                        dispatch={this.props.dispatch}
                        entityType="dashboard"
                        entityId={dashboard.id}
                        revisions={this.props.revisions["dashboard-"+dashboard.id]}
                        onFetchRevisions={this.onFetchRevisions.bind(this)}
                        onRevertToRevision={this.onRevertToRevision.bind(this)}
                        onClose={() => this.refs.dashboardHistory.toggle()}
                        onReverted={() => this.onRevertedRevision()}
                    />
                </ModalWithTrigger>
            ]);
        }

        if (!isFullscreen && !isEditing) {
            let buttons = [];
            buttonSections.push(buttons);

            if (dashboard.can_write) {
                buttons.push(
                    <a title="Edit Dashboard Layout" className="text-brand-hover cursor-pointer" onClick={() => this.onEdit()}>
                        <Icon name="pencil" width="16px" height="16px" />
                    </a>
                );
            }
        }

        if (!isFullscreen) {
            var isEmpty = dashboard.ordered_cards.length === 0;
            buttonSections.push([
                <ModalWithTrigger
                    ref="addQuestionModal"
                    triggerElement={
                        <a title="Add a question to this dashboard">
                            <Icon className={cx("text-brand-hover", { "Icon--pulse": isEmpty })} name="add" width="16px" height="16px" />
                        </a>
                    }
                >
                    <AddToDashSelectQuestionModal
                        dispatch={this.props.dispatch}
                        dashboard={dashboard}
                        cards={this.props.cards}
                        onClose={() => this.refs.addQuestionModal.toggle()}
                    />
                </ModalWithTrigger>
            ]);
        }

        if (isFullscreen) {
            buttonSections.push([
                <a title="Exit fullscreen" className="text-brand-hover cursor-pointer" onClick={() => this.props.onExitFullscreen()}>
                    <Icon name="contract" width="16px" height="16px" />
                </a>
            ]);
        } else if (!isEditing) {
            buttonSections.push([
                <a title="Fullscreen" className="text-brand-hover cursor-pointer pr1" onClick={() => this.props.onFullscreen()}>
                    <Icon name="expand" width="16px" height="16px" />
                </a>
            ]);
        }

        return buttonSections;
    }

    render() {
        var { dashboard } = this.props;

        return (
            <Header
                headerClassName="Dash-wrapper wrapper"
                objectType="dashboard"
                item={dashboard}
                isEditing={this.props.isEditing}
                isEditingInfo={this.props.isEditing}
                headerButtons={this.getHeaderButtons()}
                editingTitle="You are editing a dashboard"
                editingButtons={this.getEditingButtons()}
                setItemAttributeFn={this.onAttributeChange.bind(this)}
            >
            </Header>
        );
    }
}
