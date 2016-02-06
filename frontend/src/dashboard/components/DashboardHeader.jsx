import React, { Component, PropTypes } from "react";

import ActionButton from "metabase/components/ActionButton.jsx";
import AddToDashSelectQuestionModal from "./AddToDashSelectQuestionModal.jsx";
import DeleteDashboardModal from "./DeleteDashboardModal.jsx";
import Header from "metabase/components/Header.jsx";
import HistoryModal from "metabase/components/HistoryModal.jsx";
import Icon from "metabase/components/Icon.jsx";
import ModalWithTrigger from "metabase/components/ModalWithTrigger.jsx";

import cx from "classnames";

export default class DashboardHeader extends Component {
    static propTypes = {
        dashboard: PropTypes.object.isRequired,
        revisions: PropTypes.object.isRequired,
        isEditing: PropTypes.bool.isRequired,

        addCardToDashboard: PropTypes.func.isRequired,
        deleteDashboard: PropTypes.func.isRequired,
        fetchCards: PropTypes.func.isRequired,
        fetchDashboard: PropTypes.func.isRequired,
        fetchRevisions: PropTypes.func.isRequired,
        revertToRevision: PropTypes.func.isRequired,
        saveDashboard: PropTypes.func.isRequired,
        setDashboardAttributes: PropTypes.func.isRequired,
        setEditingDashboard: PropTypes.func.isRequired,
    };

    onEdit() {
        this.props.setEditingDashboard(true);
    }

    onDoneEditing() {
        this.props.setEditingDashboard(false);
    }

    onRevert() {
        this.props.fetchDashboard(this.props.dashboard.id);
    }

    onAttributeChange(attribute, value) {
        this.props.setDashboardAttributes({
            id: this.props.dashboard.id,
            attributes: { [attribute]: value }
        });
    }

    async onSave() {
        await this.props.saveDashboard(this.props.dashboard.id);
        this.onDoneEditing();
    }

    async onCancel() {
        this.onRevert();
        this.onDoneEditing();
    }

    async onDelete() {
        await this.props.deleteDashboard(this.props.dashboard.id);
        this.props.onDashboardDeleted(this.props.dashboard.id)
        this.props.onChangeLocation("/")
    }

    // 1. fetch revisions
    onFetchRevisions({ entity, id }) {
        return this.props.fetchRevisions({ entity, id });
    }

    // 2. revert to a revision
    onRevertToRevision({ entity, id, revision_id }) {
        return this.props.revertToRevision({ entity, id, revision_id });
    }

    // 3. finished reverting to a revision
    onRevertedRevision() {
        this.refs.dashboardHistory.toggle();
        this.props.fetchDashboard(this.props.dashboard.id);
    }

    getEditingButtons() {
        return [
            <ActionButton
                key="save"
                actionFn={() => this.onSave()}
                className="Button Button--small Button--primary text-uppercase"
                normalText="Save"
                activeText="Saving…"
                failedText="Save failed"
                successText="Saved"
            />,
            <a data-metabase-event="Dashboard;Cancel Edits" key="cancel" className="Button Button--small text-uppercase" onClick={() => this.onCancel()}>
                Cancel
            </a>,
            <ModalWithTrigger
                key="delete"
                ref="deleteDashboardModal"
                triggerClasses="Button Button--small text-uppercase"
                triggerElement="Delete"
            >
                <DeleteDashboardModal
                    dashboard={this.props.dashboard}
                    onClose={() => this.refs.deleteDashboardModal.toggle()}
                    onDelete={() => this.onDelete()}
                />
            </ModalWithTrigger>
        ];
    }

    getHeaderButtons() {
        var buttonSections = [[],[]];

        var { dashboard } = this.props;

        if (this.props.isEditing) {
            buttonSections[0].push(
                <ModalWithTrigger
                    key="history"
                    ref="dashboardHistory"
                    triggerElement={<Icon className="text-brand-hover" name="history" width="16px" height="16px" />}
                >
                    <HistoryModal
                        entityType="dashboard"
                        entityId={dashboard.id}
                        revisions={this.props.revisions["dashboard-"+dashboard.id]}
                        onFetchRevisions={this.onFetchRevisions.bind(this)}
                        onRevertToRevision={this.onRevertToRevision.bind(this)}
                        onClose={() => this.refs.dashboardHistory.toggle()}
                        onReverted={() => this.onRevertedRevision()}
                    />
                </ModalWithTrigger>
            );
        }

        if (dashboard && dashboard.can_write && !this.props.isEditing) {
            buttonSections[0].push(
                <a data-metabase-event="Dashboard;Edit" key="edit" title="Edit Dashboard Layout" className="text-brand-hover cursor-pointer" onClick={() => this.onEdit()}>
                    <Icon name="pencil" width="16px" height="16px" />
                </a>
            );
        }

        var isEmpty = dashboard.ordered_cards.length === 0;
        buttonSections[1].push(
            <ModalWithTrigger
                key="add"
                ref="addQuestionModal"
                triggerElement={
                    <span data-metabase-event="Dashboard;Add Card Modal" title="Add a question to this dashboard">
                        <Icon className={cx("text-brand-hover cursor-pointer", { "Icon--pulse": isEmpty })} name="add" width="16px" height="16px" />
                    </span>
                }
            >
                <AddToDashSelectQuestionModal
                    dashboard={dashboard}
                    cards={this.props.cards}
                    fetchCards={this.props.fetchCards}
                    addCardToDashboard={this.props.addCardToDashboard}
                    setEditingDashboard={this.props.setEditingDashboard}
                    onClose={() => this.refs.addQuestionModal.toggle()}
                />
            </ModalWithTrigger>
        );

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
