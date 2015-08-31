'use strict';
/*global setTimeout, clearTimeout*/

import ActionButton from 'metabase/components/ActionButton.react';
import AddToDashboard from './add_to_dashboard.react';
import AddToDashSelectDashModal from '../components/AddToDashSelectDashModal.react';
import CardFavoriteButton from './card_favorite_button.react';
import DeleteQuestionModal from '../components/DeleteQuestionModal.react';
import Header from "metabase/components/Header.react";
import HistoryModal from "metabase/components/HistoryModal.react";
import Icon from "metabase/components/Icon.react";
import Modal from "metabase/components/Modal.react";
import ModalWithTrigger from "metabase/components/ModalWithTrigger.react";
import QueryModeToggle from './query_mode_toggle.react';
import QuestionSavedModal from '../components/QuestionSavedModal.react';
import SaveQuestionModal from '../components/SaveQuestionModal.react';

import inflection from "inflection";
import cx from "classnames";

export default React.createClass({
    displayName: 'QueryHeader',
    propTypes: {
        card: React.PropTypes.object.isRequired,
        tableMetadata: React.PropTypes.object, // can't be required, sometimes null
        cardApi: React.PropTypes.func.isRequired,
        dashboardApi: React.PropTypes.func.isRequired,
        revisionApi: React.PropTypes.func.isRequired,
        notifyCardChangedFn: React.PropTypes.func.isRequired,
        notifyCardAddedToDashFn: React.PropTypes.func.isRequired,
        reloadCardFn: React.PropTypes.func.isRequired,
        setQueryModeFn: React.PropTypes.func.isRequired,
        isShowingDataReference: React.PropTypes.bool.isRequired,
        toggleDataReferenceFn: React.PropTypes.func.isRequired,
        cardIsNewFn: React.PropTypes.func.isRequired,
        cardIsDirtyFn: React.PropTypes.func.isRequired
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
        var buttons = [];

        if (this.props.cardIsNewFn() && this.props.cardIsDirtyFn()) {
            buttons.push(
                <ModalWithTrigger
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
            buttons.push(
                <ModalWithTrigger
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
            buttons.push(
                <QueryModeToggle
                    currentQueryMode={this.props.card.dataset_query.type}
                    setQueryModeFn={this.setQueryMode}
                />
            );
        }

        var dataReferenceButtonClasses = cx({
            'mx1': true,
            'transition-color': true,
            'text-grey-4': !this.props.isShowingDataReference,
            'text-brand': this.props.isShowingDataReference,
            'text-brand-hover': !this.state.isShowingDataReference
        });
        var dataReferenceButton = (
            <a href="#" className={dataReferenceButtonClasses} title="Get help on what data means">
                <Icon name='reference' width="16px" height="16px" onClick={this.toggleDataReference}></Icon>
            </a>
        );

        return [buttons, [dataReferenceButton]];
    },

    getEditingButtons: function() {
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
        );
        return editingButtons;
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
