import React, { Component, PropTypes } from "react";

import ActionButton from 'metabase/components/ActionButton.jsx';
import AddToDashSelectDashModal from 'metabase/components/AddToDashSelectDashModal.jsx';
import DeleteQuestionModal from 'metabase/components/DeleteQuestionModal.jsx';
import HeaderBar from "metabase/components/HeaderBar.jsx";
import HistoryModal from "metabase/components/HistoryModal.jsx";
import Icon from "metabase/components/Icon.jsx";
import Modal from "metabase/components/Modal.jsx";
import ModalWithTrigger from "metabase/components/ModalWithTrigger.jsx";
import QueryModeToggle from './QueryModeToggle.jsx';
import QuestionSavedModal from 'metabase/components/QuestionSavedModal.jsx';
import SaveQuestionModal from 'metabase/components/SaveQuestionModal.jsx';

import Query from "metabase/lib/query";

import cx from "classnames";


export default React.createClass({
    displayName: 'QueryHeader',
    propTypes: {
        card: PropTypes.object.isRequired,
        originalCard: PropTypes.object,
        isEditing: PropTypes.bool.isRequired,
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

    onBeginEditing: function() {
        this.props.onBeginEditing();
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
        if (this.props.fromUrl) {
            this.onGoBack();
        } else {
            this.props.onCancelEditing();
        }
    },

    onDelete: async function () {
        await this.props.cardApi.delete({ 'cardId': this.props.card.id }).$promise;
        this.onGoBack();
    },

    onFollowBreadcrumb: function() {
        this.props.onRestoreOriginalQuery();
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
        var buttonSections = [];

        // NEW card
        if (this.props.cardIsNewFn()) {
            if (this.props.cardIsDirtyFn()) {
                buttonSections.push([
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
                ]);
            } else {
                buttonSections.push([
                    <QueryModeToggle
                        key="queryModeToggle"
                        currentQueryMode={this.props.card.dataset_query.type}
                        setQueryModeFn={this.setQueryMode}
                    />
                ]);
            }
        }

        // persistence buttons on saved cards
        if (!this.props.cardIsNewFn()) {
            if (!this.props.isEditing) {
                if (this.state.recentlySaved) {
                    // existing card + not editing + recently saved = save confirmation
                    buttonSections.push([
                        <button key="recentlySaved" className="cursor-pointer bg-white text-success text-strong text-uppercase">
                            <span>
                                <Icon name='check' width="12px" height="12px" />
                                <span className="ml1">Saved</span>
                            </span>
                        </button>
                    ]);

                } else {
                    // edit button
                    buttonSections.push([
                        <a key="edit" className="cursor-pointer text-brand-hover" onClick={() => this.onBeginEditing()}>
                            <Icon name="pencil" width="16px" height="16px" />
                        </a>
                    ]);
                }

            } else {
                // save button
                buttonSections.push([
                    <ActionButton
                        key="save"
                        actionFn={() => this.onSave()}
                        className="cursor-pointer text-brand-hover bg-white text-grey-4 text-uppercase"
                        normalText="SAVE CHANGES"
                        activeText="Saving…"
                        failedText="Save failed"
                        successText="Saved"
                    />
                ]);

                // cancel button
                buttonSections.push([
                    <a key="cancel" className="cursor-pointer text-brand-hover text-uppercase" onClick={() => this.onCancel()}>
                        CANCEL
                    </a>
                ]);

                // delete button
                buttonSections.push([
                    <ModalWithTrigger
                        key="delete"
                        ref="deleteModal"
                        triggerElement={<span className="text-brand-hover"><Icon name="trash" width="16px" height="16px" /></span>}
                    >
                        <DeleteQuestionModal
                            card={this.props.card}
                            deleteCardFn={() => this.onDelete()}
                            closeFn={() => this.refs.deleteModal.toggle()}
                        />
                    </ModalWithTrigger>
                ]);
            }
        }

        // TODO: add to dashboard
        //   if (!new && !editing) OR (new && dirty)

        // history icon on saved cards
        if (!this.props.cardIsNewFn()) {
            buttonSections.push([
                <ModalWithTrigger
                    key="history"
                    ref="cardHistory"
                    triggerElement={<span className="text-brand-hover"><Icon name="history" width="16px" height="16px" /></span>}
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
            ]);
        }

        // data reference button
        var dataReferenceButtonClasses = cx('mx1 transition-color', {
            'text-grey-4': !this.props.isShowingDataReference,
            'text-brand': this.props.isShowingDataReference,
            'text-brand-hover': !this.state.isShowingDataReference
        });
        buttonSections.push([
            <a key="dataReference" className={dataReferenceButtonClasses} title="Get help on what data means">
                <Icon name='reference' width="16px" height="16px" onClick={this.toggleDataReference}></Icon>
            </a>
        ]);

        return buttonSections;
    },

    render: function() {
        return (
            <div>
                <HeaderBar
                    isEditing={this.props.isEditing}
                    name={this.props.cardIsNewFn() ? "New question" : this.props.card.name}
                    breadcrumb={(!this.props.card.id && this.props.originalCard) ? (<span className="pl2">started from <a className="link" onClick={this.onFollowBreadcrumb}>{this.props.originalCard.name}</a></span>) : null }
                    buttons={this.getHeaderButtons()}
                    setItemAttributeFn={this.setCardAttribute}
                />

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
            </div>
        );
    }
});
