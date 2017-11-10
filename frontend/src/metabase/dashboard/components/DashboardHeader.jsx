/* @flow */

import React, { Component } from "react";
import PropTypes from "prop-types";

import ActionButton from "metabase/components/ActionButton.jsx";
import AddToDashSelectQuestionModal from "./AddToDashSelectQuestionModal.jsx";
import ArchiveDashboardModal from "./ArchiveDashboardModal.jsx";
import Header from "metabase/components/Header.jsx";
import HistoryModal from "metabase/components/HistoryModal.jsx";
import Icon from "metabase/components/Icon.jsx";
import ModalWithTrigger from "metabase/components/ModalWithTrigger.jsx";
import Tooltip from "metabase/components/Tooltip.jsx";
import DashboardEmbedWidget from "../containers/DashboardEmbedWidget";

import { getDashboardActions } from "./DashboardActions";

import ParametersPopover from "./ParametersPopover.jsx";
import Popover from "metabase/components/Popover.jsx";

import { CardApi } from "metabase/services";
import MetabaseSettings from "metabase/lib/settings";
import { createCard } from "metabase/lib/card";

import cx from "classnames";

import type { LocationDescriptor, QueryParams, EntityType, EntityId } from "metabase/meta/types";
import type { Card, CardId } from "metabase/meta/types/Card";
import type { Parameter, ParameterId, ParameterOption } from "metabase/meta/types/Parameter";
import type { DashboardWithCards, DashboardId, DashCardId } from "metabase/meta/types/Dashboard";
import type { Revision, RevisionId } from "metabase/meta/types/Revision";

type Props = {
    location:               LocationDescriptor,

    dashboard:              DashboardWithCards,
    cards:                  Card[],
    revisions:              { [key: string]: Revision[] },

    isAdmin:                boolean,
    isEditable:             boolean,
    isEditing:              boolean,
    isFullscreen:           boolean,
    isNightMode:            boolean,

    refreshPeriod:          ?number,
    refreshElapsed:         ?number,

    parametersWidget:       React$Element<*>,

    addCardToDashboard:     ({ dashId: DashCardId, cardId: CardId }) => void,
    archiveDashboard:        (dashboardId: DashboardId) => void,
    fetchCards:             (filterMode?: string) => void,
    fetchDashboard:         (dashboardId: DashboardId, queryParams: ?QueryParams) => void,
    fetchRevisions:         ({ entity: string, id: number }) => void,
    revertToRevision:       ({ entity: string, id: number, revision_id: RevisionId }) => void,
    saveDashboardAndCards:  () => Promise<void>,
    setDashboardAttribute:  (attribute: string, value: any) => void,

    addParameter:           (option: ParameterOption) => Promise<Parameter>,
    setEditingParameter:    (parameterId: ?ParameterId) => void,

    onEditingChange:        (isEditing: boolean) => void,
    onRefreshPeriodChange:  (?number) => void,
    onNightModeChange:      (boolean) => void,
    onFullscreenChange:     (boolean) => void,

    onChangeLocation:       (string) => void,
}

type State = {
    modal: null|"parameters",
}

export default class DashboardHeader extends Component {
    props: Props;
    state: State = {
        modal: null,
    };

    static propTypes = {
        dashboard: PropTypes.object.isRequired,
        revisions: PropTypes.object.isRequired,
        isEditable: PropTypes.bool.isRequired,
        isEditing: PropTypes.bool.isRequired,
        isFullscreen: PropTypes.bool.isRequired,
        isNightMode: PropTypes.bool.isRequired,

        refreshPeriod: PropTypes.number,
        refreshElapsed: PropTypes.number,

        addCardToDashboard: PropTypes.func.isRequired,
        archiveDashboard: PropTypes.func.isRequired,
        fetchCards: PropTypes.func.isRequired,
        fetchDashboard: PropTypes.func.isRequired,
        fetchRevisions: PropTypes.func.isRequired,
        revertToRevision: PropTypes.func.isRequired,
        saveDashboardAndCards: PropTypes.func.isRequired,
        setDashboardAttribute: PropTypes.func.isRequired,

        onEditingChange: PropTypes.func.isRequired,
        onRefreshPeriodChange: PropTypes.func.isRequired,
        onNightModeChange: PropTypes.func.isRequired,
        onFullscreenChange: PropTypes.func.isRequired
    };

    onEdit() {
        this.props.onEditingChange(true);
    }

    async onAddTextBox() {
        const newTextCard = createCard("text");
        newTextCard.display = "text";
        const savedCard = await CardApi.create(newTextCard);
        // we have to update the frontend's state of cards
        await this.props.fetchCards();
        this.props.addCardToDashboard({ dashId: this.props.dashboard.id, cardId: savedCard.id });
    }

    onDoneEditing() {
        this.props.onEditingChange(false);
    }

    onRevert() {
        this.props.fetchDashboard(this.props.dashboard.id, this.props.location.query);
    }

    async onSave() {
        await this.props.saveDashboardAndCards(this.props.dashboard.id);
        this.onDoneEditing();
    }

    async onCancel() {
        this.onRevert();
        this.onDoneEditing();
    }

    async onArchive() {
        await this.props.archiveDashboard(this.props.dashboard.id);
        this.props.onChangeLocation("/dashboards");
    }

    // 1. fetch revisions
    onFetchRevisions({ entity, id }: { entity: EntityType, id: EntityId }) {
        return this.props.fetchRevisions({ entity, id });
    }

    // 2. revert to a revision
    onRevertToRevision({ entity, id, revision_id }: { entity: EntityType, id: EntityId, revision_id: RevisionId }) {
        return this.props.revertToRevision({ entity, id, revision_id });
    }

    // 3. finished reverting to a revision
    onRevertedRevision() {
        this.refs.dashboardHistory.toggle();
        this.props.fetchDashboard(this.props.dashboard.id, this.props.location.query);
    }

    getEditingButtons() {
        return [
            <a data-metabase-event="Dashboard;Cancel Edits" key="cancel" className="Button Button--small" onClick={() => this.onCancel()}>
                Cancel
            </a>,
            <ModalWithTrigger
                key="archive"
                ref="archiveDashboardModal"
                triggerClasses="Button Button--small"
                triggerElement="Archive"
            >
                <ArchiveDashboardModal
                    dashboard={this.props.dashboard}
                    onClose={() => this.refs.archiveDashboardModal.toggle()}
                    onArchive={() => this.onArchive()}
                />
            </ModalWithTrigger>,
            <ActionButton
                key="save"
                actionFn={() => this.onSave()}
                className="Button Button--small Button--primary"
                normalText="Save"
                activeText="Saving…"
                failedText="Save failed"
                successText="Saved"
            />
        ];
    }

    getHeaderButtons() {
        const { dashboard, parametersWidget, isEditing, isFullscreen, isEditable, isAdmin } = this.props;
        const isEmpty = !dashboard || dashboard.ordered_cards.length === 0;
        const canEdit = isEditable && !!dashboard;

        const isPublicLinksEnabled = MetabaseSettings.get("public_sharing");
        const isEmbeddingEnabled = MetabaseSettings.get("embedding");

        const buttons = [];

        if (isFullscreen && parametersWidget) {
            buttons.push(parametersWidget);
        }

        if (!isFullscreen && canEdit) {
            buttons.push(
                <ModalWithTrigger
                    full
                    key="add"
                    ref="addQuestionModal"
                    triggerElement={
                        <Tooltip tooltip="Add a question">
                            <span data-metabase-event="Dashboard;Add Card Modal" title="Add a question to this dashboard">
                                <Icon className={cx("text-brand-hover cursor-pointer", { "Icon--pulse": isEmpty })} name="add" size={16} />
                            </span>
                        </Tooltip>
                    }
                >
                    <AddToDashSelectQuestionModal
                        dashboard={dashboard}
                        cards={this.props.cards}
                        fetchCards={this.props.fetchCards}
                        addCardToDashboard={this.props.addCardToDashboard}
                        onEditingChange={this.props.onEditingChange}
                        onClose={() => this.refs.addQuestionModal.toggle()}
                    />
                </ModalWithTrigger>
            );
        }

        if (isEditing) {
            // Parameters
            buttons.push(
                <span>
                    <Tooltip tooltip="Add a filter">
                        <a
                          key="parameters"
                          className={cx("text-brand-hover", { "text-brand": this.state.modal == "parameters" })}
                          title="Parameters"
                          onClick={() => this.setState({ modal: "parameters" })}
                        >
                            <Icon name="funneladd" size={16} />
                        </a>
                    </Tooltip>

                    {this.state.modal && this.state.modal === "parameters" &&
                        <Popover onClose={() => this.setState({ modal: null })}>
                            <ParametersPopover
                                onAddParameter={this.props.addParameter}
                                onClose={() => this.setState({ modal: null })}
                            />
                        </Popover>
                    }
                </span>
            );

            // Add text card button
            buttons.push(
                <Tooltip tooltip="Add a text box">
                    <a data-metabase-event="Dashboard;Add Text Box" key="add-text" title="Add a text box" className="text-brand-hover cursor-pointer" onClick={() => this.onAddTextBox()}>
                        <Icon name="string" size={16} />
                    </a>
                </Tooltip>
            );

            buttons.push(
                <ModalWithTrigger
                    key="history"
                    ref="dashboardHistory"
                    triggerElement={
                        <Tooltip tooltip="Revision history">
                            <span data-metabase-event={"Dashboard;Revisions"}>
                                <Icon className="text-brand-hover" name="history" size={16} />
                            </span>
                        </Tooltip>
                    }
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

        if (!isFullscreen && !isEditing && canEdit) {
            buttons.push(
                <Tooltip tooltip="Edit dashboard">
                    <a data-metabase-event="Dashboard;Edit" key="edit" title="Edit Dashboard Layout" className="text-brand-hover cursor-pointer" onClick={() => this.onEdit()}>
                        <Icon name="pencil" size={16} />
                    </a>
                </Tooltip>
            );
        }

        if (!isFullscreen && (
            (isPublicLinksEnabled && (isAdmin || dashboard.public_uuid)) ||
            (isEmbeddingEnabled && isAdmin)
        )) {
            buttons.push(
                <DashboardEmbedWidget dashboard={dashboard} />
            )
        }

        buttons.push(...getDashboardActions(this.props));

        return [buttons];
    }

    render() {
        var { dashboard } = this.props;

        return (
            <Header
                headerClassName="wrapper"
                objectType="dashboard"
                item={dashboard}
                isEditing={this.props.isEditing}
                isEditingInfo={this.props.isEditing}
                headerButtons={this.getHeaderButtons()}
                editingTitle="You are editing a dashboard"
                editingButtons={this.getEditingButtons()}
                setItemAttributeFn={this.props.setDashboardAttribute}
                headerModalMessage={this.props.isEditingParameter ?
                    "Select the field that should be filtered for each card" : null}
                onHeaderModalDone={() => this.props.setEditingParameter(null)}
            >
            </Header>
        );
    }
}
