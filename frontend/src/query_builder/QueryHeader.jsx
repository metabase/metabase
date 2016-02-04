import React, { Component, PropTypes } from "react";

import ActionButton from 'metabase/components/ActionButton.jsx';
import AddToDashSelectDashModal from 'metabase/components/AddToDashSelectDashModal.jsx';
import DeleteQuestionModal from 'metabase/components/DeleteQuestionModal.jsx';
import Header from "metabase/components/Header.jsx";
import HistoryModal from "metabase/components/HistoryModal.jsx";
import Icon from "metabase/components/Icon.jsx";
import Modal from "metabase/components/Modal.jsx";
import ModalWithTrigger from "metabase/components/ModalWithTrigger.jsx";
import QueryModeToggle from './QueryModeToggle.jsx';
import QuestionSavedModal from 'metabase/components/QuestionSavedModal.jsx';
import SaveQuestionModal from 'metabase/components/SaveQuestionModal.jsx';

import Query from "metabase/lib/query";

import inflection from "inflection";
import cx from "classnames";

export default React.createClass({
    displayName: 'QueryHeader',
    propTypes: {
        card: PropTypes.object.isRequired,
        tableMetadata: PropTypes.object, // can't be required, sometimes null
        cardApi: PropTypes.func.isRequired,
        dashboardApi: PropTypes.func.isRequired,
        revisionApi: PropTypes.func.isRequired,
        notifyCardChangedFn: PropTypes.func.isRequired,
        notifyCardAddedToDashFn: PropTypes.func.isRequired,
        reloadCardFn: PropTypes.func.isRequired,
        setQueryModeFn: PropTypes.func.isRequired,
        isShowingDataReference: PropTypes.bool.isRequired,
        toggleDataReferenceFn: PropTypes.func.isRequired,
        cardIsNewFn: PropTypes.func.isRequired,
        cardIsDirtyFn: PropTypes.func.isRequired
    },

    getInitialState: function() {
        return {
            recentlySaved: null,
            modal: null,
            revisions: null
        };
    },

    resetStateOnTimeout: function() {
        // clear any previously set timeouts then start a new one
        clearTimeout(this.timeout);
        this.timeout = setTimeout(() => {
            if (this.isMounted()) {
                this.setState({
                    recentlySaved: null
                });
            }
        }, 5000);
    },

    onCreate: async function(card) {
        let newCard = await this.props.cardApi.create(card).$promise;
        this.props.notifyCardCreatedFn(newCard);
        if (this.isMounted()) {
            // update local state to reflect new card state
            this.setState({ recentlySaved: "created", modal: "saved" }, this.resetStateOnTimeout);
        }
    },

    onSave: async function() {
        let card = this.props.card;

        if (card.dataset_query.query) {
            Query.cleanQuery(card.dataset_query.query);
        }

        let updatedCard = await this.props.cardApi.update(card).$promise;
        if (this.props.fromUrl) {
            this.onGoBack();
            return;
        }
        this.props.notifyCardUpdatedFn(updatedCard);
        if (this.isMounted()) {
            // update local state to reflect new card state
            this.setState({ recentlySaved: "updated" }, this.resetStateOnTimeout);
        }
    },

    onCancel: async function() {
        this.onGoBack();
    },

    onDelete: async function () {
        await this.props.cardApi.delete({ 'cardId': this.props.card.id }).$promise;
        this.onGoBack();
    },

    setQueryMode: function(mode) {
        this.props.setQueryModeFn(mode);
    },

    toggleDataReference: function() {
        this.props.toggleDataReferenceFn();
    },

    setCardAttribute: function(attribute, value) {
        this.props.card[attribute] = value;
        this.props.notifyCardChangedFn(this.props.card);
    },

    onGoBack: function() {
        this.props.onChangeLocation(this.props.fromUrl || "/");
    },

    onFetchRevisions: async function({ entity, id }) {
        var revisions = await this.props.revisionApi.list({ entity, id }).$promise;
        this.setState({ revisions });
    },

    onRevertToRevision: function({ entity, id, revision_id }) {
        return this.props.revisionApi.revert({ entity, id, revision_id }).$promise;
    },

    onRevertedRevision: function() {
        this.props.reloadCardFn();
        this.refs.cardHistory.toggle();
    },

    getHeaderButtons: function() {
        var buttonSections = [[],[]];

        if (this.props.cardIsNewFn() && this.props.cardIsDirtyFn()) {
            buttonSections[0].push(
                <ModalWithTrigger
                    key="save"
                    ref="saveModal"
                    triggerClasses="h4 px1 text-grey-4 text-brand-hover text-uppercase"
                    triggerElement="Save"
                >
                    <SaveQuestionModal
                        card={this.props.card}
                        tableMetadata={this.props.tableMetadata}
                        saveFn={this.onCreate}
                        closeFn={() => this.refs.saveModal.toggle()}
                    />
                </ModalWithTrigger>
            );
        }

        if (!this.props.cardIsNewFn()) {
            buttonSections[0].push(
                <ModalWithTrigger
                    key="history"
                    ref="cardHistory"
                    triggerElement={<Icon name="history" width="16px" height="16px" />}
                >
                    <HistoryModal
                        revisions={this.state.revisions}
                        entityType="card"
                        entityId={this.props.card.id}
                        onFetchRevisions={this.onFetchRevisions}
                        onRevertToRevision={this.onRevertToRevision}
                        onClose={() => this.refs.cardHistory.toggle()}
                        onReverted={this.onRevertedRevision}
                    />
                </ModalWithTrigger>
            );
        }

        if (this.props.cardIsNewFn() && !this.props.cardIsDirtyFn()) {
            buttonSections[0].push(
                <QueryModeToggle
                    key="queryModeToggle"
                    currentQueryMode={this.props.card.dataset_query.type}
                    setQueryModeFn={this.setQueryMode}
                />
            );
        }

        var dataReferenceButtonClasses = cx('mx1 transition-color', {
            'text-grey-4': !this.props.isShowingDataReference,
            'text-brand': this.props.isShowingDataReference,
            'text-brand-hover': !this.state.isShowingDataReference
        });
        buttonSections[1].push(
            <a key="dataReference" className={dataReferenceButtonClasses} title="Get help on what data means">
                <Icon name='reference' width="16px" height="16px" onClick={this.toggleDataReference}></Icon>
            </a>
        );

        return buttonSections;
    },

    getEditingButtons: function() {
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
            <a key="cancel" className="Button Button--small text-uppercase" onClick={() => this.onCancel()}>
                Cancel
            </a>,
            <ModalWithTrigger
                key="delete"
                ref="deleteModal"
                triggerClasses="Button Button--small text-uppercase"
                triggerElement="Delete"
            >
                <DeleteQuestionModal
                    card={this.props.card}
                    deleteCardFn={() => this.onDelete()}
                    closeFn={() => this.refs.deleteModal.toggle()}
                />
            </ModalWithTrigger>
        ];
    },

    render: function() {
        var subtitleText;
        if (this.props.card) {
            if (this.props.card.dashboard_count > 0) {
                subtitleText = "Changes will be reflected in " + this.props.card.dashboard_count + " " + inflection.inflect("dashboard", this.props.card.dashboard_count) + " and can be reverted.";
            } else {
                subtitleText = "Changes can be reverted."
            }
        }

        return (
            <Header
                objectType="question"
                item={this.props.card}
                isEditing={!this.props.cardIsNewFn()}
                isEditingInfo={!this.props.cardIsNewFn()}
                headerButtons={this.getHeaderButtons()}
                editingTitle="You are editing a saved question"
                editingSubtitle={subtitleText}
                editingButtons={this.getEditingButtons()}
                setItemAttributeFn={this.setCardAttribute}
            >
                <Modal isOpen={this.state.modal === "saved"}>
                    <QuestionSavedModal
                        addToDashboardFn={() => this.setState({ modal: "add-to-dashboard" })}
                        closeFn={() => this.setState({ modal: null })}
                    />
                </Modal>
                <Modal isOpen={this.state.modal === "add-to-dashboard"}>
                    <AddToDashSelectDashModal
                        card={this.props.card}
                        dashboardApi={this.props.dashboardApi}
                        closeFn={() => this.setState({ modal: null })}
                        notifyCardAddedToDashFn={this.props.notifyCardAddedToDashFn}
                    />
                </Modal>
            </Header>
        );
    }
});
