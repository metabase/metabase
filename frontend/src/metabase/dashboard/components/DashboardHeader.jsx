/* @flow */

import React, { Component } from "react";
import { t } from 'c-3po'

import ActionButton from "metabase/components/ActionButton.jsx";
import AddToDashSelectQuestionModal from "./AddToDashSelectQuestionModal.jsx";
import Header from "metabase/components/Header.jsx";
import Icon from "metabase/components/Icon.jsx";
import ModalWithTrigger from "metabase/components/ModalWithTrigger.jsx";
import Tooltip from "metabase/components/Tooltip.jsx";
import DashboardEmbedWidget from "../containers/DashboardEmbedWidget";

import EntityMenu from "metabase/components/EntityMenu"
import EntityMenuTrigger from "metabase/components/EntityMenuTrigger"

import HistoryModal from "metabase/components/HistoryModal";
import ArchiveDashboardModal from "./ArchiveDashboardModal";
import ParametersPopover from "./ParametersPopover.jsx";
import Popover from "metabase/components/Popover.jsx";

import MetabaseSettings from "metabase/lib/settings";

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
    isEditingParameter:     boolean,
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

    onEdit() {
        this.props.onEditingChange(true);
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

    getEditBarButtons() {
        return [
            <a
                data-metabase-event="Dashboard;Cancel Edits"
                key="cancel"
                className="Button Button--small"
                onClick={() => this.onCancel()}
            >
                Cancel
            </a>,
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
        const {
            dashboard,
            isFullscreen,
            isAdmin,
        } = this.props;

        const isPublicLinksEnabled = MetabaseSettings.get("public_sharing");
        const isEmbeddingEnabled = MetabaseSettings.get("embedding");

        const buttons = []
        if (!isFullscreen && (
            (isPublicLinksEnabled && (isAdmin || dashboard.public_uuid)) ||
            (isEmbeddingEnabled && isAdmin)
        )) {
            buttons.push(<DashboardEmbedWidget dashboard={dashboard} />)
        }

    }

    getDefaultActions = () => {
        const {
            isFullscreen,
            onFullscreenChange,
            isNightMode,
            onNightModeChange
        } = this.props

        return [
            <EntityMenu
                triggerIcon="pencil"
                items={[
                    {
                        title: t`Edit dashboard`,
                        icon: 'editdocument',
                        action: () => this.onEdit()
                    },
                    {
                        title: t`View revision history`,
                        icon: 'history',
                        action: () => this.refs.dashboardHistory.toggle()
                    },
                    {
                        title: t`Archive`,
                        icon: 'archive',
                        action: () => this.refs.dashboardArchive.toggle()
                    }
                ]}
            />,
            <EntityMenu
                triggerIcon="burger"
                items={[
                    {
                        title: isFullscreen
                            ? t`Exit fullscreen`
                            : t`Enter fullscreen`,
                        icon: isFullscreen
                            ? 'contract'
                            : 'expand',
                        action: () => onFullscreenChange(!isFullscreen)
                    },
                    {
                        title: t`Auto refresh`,
                        icon: 'clock',
                        action: () => this.refs.dashboardHistory.toggle()
                    },
                    {
                        title: t`Night mode`,
                        icon: 'moon',
                        action: () => onNightModeChange(!isNightMode)
                    }
                ]}
            />
        ]
    }

    getEditingActions = () => {
        const {
            dashboard,
            cards,
            fetchCards,
            addCardToDashboard,
            onEditingChange,
        } = this.props

        const isEmpty = !dashboard || dashboard.ordered_cards.length === 0;

        return [
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
                    cards={cards}
                    fetchCards={fetchCards}
                    addCardToDashboard={addCardToDashboard}
                    onEditingChange={onEditingChange}
                    onClose={() => this.refs.addQuestionModal.toggle()}
                />
            </ModalWithTrigger>,
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
        ]
    }

    getFullscreenActions = () => {
        const {
            isFullscreen,
            isNightMode,
            onFullscreenChange,
            onNightModeChange,
            parametersWidget
        } = this.props

        return [
            <EntityMenuTrigger
                icon={ isNightMode ? 'moon' : 'sun' }
                onClick={() => onNightModeChange(!isNightMode)}
            />,
            <EntityMenuTrigger
                icon='contract'
                onClick={() => onFullscreenChange(!isFullscreen)}
            />,
            parametersWidget && parametersWidget
        ]
    }

    render() {
        const {
            dashboard,
            isEditing,
            isEditingParameter,
            isFullscreen,
            revisions,
            setDashboardAttribute,
            setEditingParameter,
        } = this.props;

        return (
            <span>
                <Header
                    objectType="dashboard"
                    // For some reason flow complains about the creator here
                    // $FlowFixMe
                    item={dashboard}

                    defaultActions={[this.getDefaultActions()]}

                    isEditing={isEditing}
                    editingActions={[this.getEditingActions()]}

                    isFullscreen={isFullscreen}
                    fullscreenActions={[this.getFullscreenActions()]}

                    editBarButtons={this.getEditBarButtons()}

                    // This seems like it could be moved into the edit bar based
                    // on the objectType
                    editingTitle="You are editing a dashboard"

                    setItemAttributeFn={setDashboardAttribute}

                    headerModalMessage={
                        isEditingParameter
                            ? "Select the field that should be filtered for each card"
                            : null
                    }
                    onHeaderModalDone={() => setEditingParameter(null)}
                />
                {
                    /*
                     * we need to include the modals here so the're avaliable
                     * to be triggered by actions in the entiy menus
                     * TODO - should these still be <ModalWithTrigger /> ?
                     * */
                }
                <ModalWithTrigger key="history" ref="dashboardHistory" >
                    <HistoryModal
                        entityType="dashboard"
                        entityId={dashboard.id}
                        revisions={revisions[`dashboard-${dashboard.id}`]}
                        onFetchRevisions={this.onFetchRevisions.bind(this)}
                        onRevertToRevision={this.onRevertToRevision.bind(this)}
                        onClose={() => this.refs.dashboardHistory.toggle()}
                        onReverted={() => this.onRevertedRevision()}
                    />
                </ModalWithTrigger>

                <ModalWithTrigger key="archive" ref="dashboardArchive">
                    <ArchiveDashboardModal
                        dashboard={dashboard}
                        onClose={() => this.refs.dashboardArchive.toggle()}
                        onArchive={this.onArchive}
                    />
                </ModalWithTrigger>
            </span>
        );
    }
}
