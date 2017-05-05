import React, { Component } from "react";
import PropTypes from "prop-types";
import { Link } from "react-router";

import QueryModeButton from "./QueryModeButton.jsx";

import ActionButton from 'metabase/components/ActionButton.jsx';
import AddToDashSelectDashModal from 'metabase/containers/AddToDashSelectDashModal.jsx';
import ButtonBar from "metabase/components/ButtonBar.jsx";
import HeaderBar from "metabase/components/HeaderBar.jsx";
import HistoryModal from "metabase/components/HistoryModal.jsx";
import Icon from "metabase/components/Icon.jsx";
import Modal from "metabase/components/Modal.jsx";
import ModalWithTrigger from "metabase/components/ModalWithTrigger.jsx";
import QuestionSavedModal from 'metabase/components/QuestionSavedModal.jsx';
import Tooltip from "metabase/components/Tooltip.jsx";
import MoveToCollection from "metabase/questions/containers/MoveToCollection.jsx";
import ArchiveQuestionModal from "metabase/query_builder/containers/ArchiveQuestionModal"

import SaveQuestionModal from 'metabase/containers/SaveQuestionModal.jsx';

import { CardApi, RevisionApi } from "metabase/services";

import MetabaseAnalytics from "metabase/lib/analytics";
import Query from "metabase/lib/query";
import { cancelable } from "metabase/lib/promise";
import * as Urls from "metabase/lib/urls";

import cx from "classnames";
import _ from "underscore";


export default class QueryHeader extends Component {
    constructor(props, context) {
        super(props, context);

        this.state = {
            recentlySaved: null,
            modal: null,
            revisions: null
        };

        _.bindAll(this, "resetStateOnTimeout",
            "onCreate", "onSave", "onBeginEditing", "onCancel", "onDelete",
            "onFollowBreadcrumb", "onToggleDataReference",
            "onFetchRevisions", "onRevertToRevision", "onRevertedRevision"
        );
    }

    static propTypes = {
        card: PropTypes.object.isRequired,
        originalCard: PropTypes.object,
        isEditing: PropTypes.bool.isRequired,
        tableMetadata: PropTypes.object, // can't be required, sometimes null
        onSetCardAttribute: PropTypes.func.isRequired,
        reloadCardFn: PropTypes.func.isRequired,
        setQueryModeFn: PropTypes.func.isRequired,
        isShowingDataReference: PropTypes.bool.isRequired,
        toggleDataReferenceFn: PropTypes.func.isRequired,
        isNew: PropTypes.bool.isRequired,
        isDirty: PropTypes.bool.isRequired
    }

    componentWillUnmount() {
        clearTimeout(this.timeout);
        if (this.requesetPromise) {
            this.requesetPromise.cancel();
        }
    }

    resetStateOnTimeout() {
        // clear any previously set timeouts then start a new one
        clearTimeout(this.timeout);
        this.timeout = setTimeout(() =>
            this.setState({ recentlySaved: null })
        , 5000);
    }

    onCreate(card, addToDash) {
        // MBQL->NATIVE
        // if we are a native query with an MBQL query definition, remove the old MBQL stuff (happens when going from mbql -> native)
        // if (card.dataset_query.type === "native" && card.dataset_query.query) {
        //     delete card.dataset_query.query;
        // } else if (card.dataset_query.type === "query" && card.dataset_query.native) {
        //     delete card.dataset_query.native;
        // }

        if (card.dataset_query.query) {
            Query.cleanQuery(card.dataset_query.query);
        }

        // TODO: reduxify
        this.requesetPromise = cancelable(CardApi.create(card));
        return this.requesetPromise.then(newCard => {
            this.props.notifyCardCreatedFn(newCard);

            this.setState({
                recentlySaved: "created",
                modal: addToDash ? "add-to-dashboard" : "saved"
            }, this.resetStateOnTimeout);
        });
    }

    onSave(card, addToDash) {
        // MBQL->NATIVE
        // if we are a native query with an MBQL query definition, remove the old MBQL stuff (happens when going from mbql -> native)
        // if (card.dataset_query.type === "native" && card.dataset_query.query) {
        //     delete card.dataset_query.query;
        // } else if (card.dataset_query.type === "query" && card.dataset_query.native) {
        //     delete card.dataset_query.native;
        // }

        if (card.dataset_query.query) {
            Query.cleanQuery(card.dataset_query.query);
        }

        // TODO: reduxify
        this.requesetPromise = cancelable(CardApi.update(card));
        return this.requesetPromise.then(updatedCard => {
            if (this.props.fromUrl) {
                this.onGoBack();
                return;
            }

            this.props.notifyCardUpdatedFn(updatedCard);

            this.setState({
                recentlySaved: "updated",
                modal: addToDash ? "add-to-dashboard" : null
            }, this.resetStateOnTimeout);
        });
    }

    onBeginEditing() {
        this.props.onBeginEditing();
    }

    async onCancel() {
        if (this.props.fromUrl) {
            this.onGoBack();
        } else {
            this.props.onCancelEditing();
        }
    }

    async onDelete() {
        // TODO: reduxify
        await CardApi.delete({ 'cardId': this.props.card.id });
        this.onGoBack();
        MetabaseAnalytics.trackEvent("QueryBuilder", "Delete");
    }

    onFollowBreadcrumb() {
        this.props.onRestoreOriginalQuery();
    }

    onToggleDataReference() {
        this.props.toggleDataReferenceFn();
    }

    onGoBack() {
        this.props.onChangeLocation(this.props.fromUrl || "/");
    }

    async onFetchRevisions({ entity, id }) {
        // TODO: reduxify
        var revisions = await RevisionApi.list({ entity, id });
        this.setState({ revisions });
    }

    onRevertToRevision({ entity, id, revision_id }) {
        // TODO: reduxify
        return RevisionApi.revert({ entity, id, revision_id });
    }

    onRevertedRevision() {
        this.props.reloadCardFn();
        this.refs.cardHistory.toggle();
    }

    getHeaderButtons() {
        const { card ,isNew, isDirty, isEditing, tableMetadata, databases } = this.props;
        const database = _.findWhere(databases, { id: card && card.dataset_query && card.dataset_query.database });

        var buttonSections = [];

        // NEW card
        if (isNew && isDirty) {
            buttonSections.push([
                <ModalWithTrigger
                    form
                    key="save"
                    ref="saveModal"
                    triggerClasses="h4 text-grey-4 text-brand-hover text-uppercase"
                    triggerElement="Save"
                >
                    <SaveQuestionModal
                        card={this.props.card}
                        originalCard={this.props.originalCard}
                        tableMetadata={this.props.tableMetadata}
                        addToDashboard={false}
                        saveFn={this.onSave}
                        createFn={this.onCreate}
                        onClose={() => this.refs.saveModal.toggle()}
                    />
                </ModalWithTrigger>
            ]);
        }

        // persistence buttons on saved cards
        if (!isNew && card.can_write) {
            if (!isEditing) {
                if (this.state.recentlySaved) {
                    // existing card + not editing + recently saved = save confirmation
                    buttonSections.push([
                        <button
                            key="recentlySaved"
                            className="cursor-pointer bg-white text-success text-strong text-uppercase"
                        >
                            <span>
                                <Icon name='check' size={12} />
                                <span className="ml1">Saved</span>
                            </span>
                        </button>
                    ]);
                } else {
                    // edit button
                    buttonSections.push([
                        <Tooltip key="edit" tooltip="Edit question">
                            <a className="cursor-pointer text-brand-hover" onClick={this.onBeginEditing}>
                                <Icon name="pencil" size={16} />
                            </a>
                        </Tooltip>
                    ]);
                }

            } else {
                // save button
                buttonSections.push([
                    <ActionButton
                        key="save"
                        actionFn={() => this.onSave(this.props.card, false)}
                        className="cursor-pointer text-brand-hover bg-white text-grey-4 text-uppercase"
                        normalText="SAVE CHANGES"
                        activeText="Saving…"
                        failedText="Save failed"
                        successText="Saved"
                    />
                ]);

                // cancel button
                buttonSections.push([
                    <a key="cancel" className="cursor-pointer text-brand-hover text-grey-4 text-uppercase" onClick={this.onCancel}>
                        CANCEL
                    </a>
                ]);

                // delete button
                buttonSections.push([
                    <ArchiveQuestionModal questionId={this.props.card.id} />
                ]);

                buttonSections.push([
                    <ModalWithTrigger
                        ref="move"
                        key="move"
                        full
                        triggerElement={
                            <Tooltip tooltip="Move question">
                                <Icon name="move" />
                            </Tooltip>
                        }
                    >
                        <MoveToCollection
                            questionId={this.props.card.id}
                            initialCollectionId={this.props.card && this.props.card.collection_id}
                            setCollection={(questionId, collection) => {
                                this.props.onSetCardAttribute('collection', collection)
                                this.props.onSetCardAttribute('collection_id', collection.id)
                            }}
                        />
                    </ModalWithTrigger>
                ]);
            }
        }

        // parameters
        if (Query.isNative(card && card.dataset_query) && database && _.contains(database.features, "native-parameters")) {
            const parametersButtonClasses = cx('transition-color', {
                'text-brand': this.props.uiControls.isShowingTemplateTagsEditor,
                'text-brand-hover': !this.props.uiControls.isShowingTemplateTagsEditor
            });
            buttonSections.push([
                <Tooltip key="parameterEdititor" tooltip="Variables">
                    <a className={parametersButtonClasses}>
                        <Icon name="variable" size={16} onClick={this.props.toggleTemplateTagsEditor}></Icon>
                    </a>
                </Tooltip>
            ]);
        }

        // add to dashboard
        if (!isNew && !isEditing) {
            // simply adding an existing saved card to a dashboard, so show the modal to do so
            buttonSections.push([
                <Tooltip key="addtodash" tooltip="Add to dashboard">
                    <span data-metabase-event={"QueryBuilder;AddToDash Modal;normal"} className="cursor-pointer text-brand-hover" onClick={() => this.setState({ modal: "add-to-dashboard" })}>
                        <Icon name="addtodash" size={16} />
                    </span>
                </Tooltip>
            ]);
        } else if (isNew && isDirty) {
            // this is a new card, so we need the user to save first then they can add to dash
            buttonSections.push([
                <Tooltip key="addtodashsave" tooltip="Add to dashboard">
                    <ModalWithTrigger
                        ref="addToDashSaveModal"
                        triggerClasses="h4 text-brand-hover text-uppercase"
                        triggerElement={<span data-metabase-event={"QueryBuilder;AddToDash Modal;pre-save"} className="text-brand-hover"><Icon name="addtodash" size={16} /></span>}
                    >
                        <SaveQuestionModal
                            card={this.props.card}
                            originalCard={this.props.originalCard}
                            tableMetadata={this.props.tableMetadata}
                            addToDashboard={true}
                            saveFn={this.onSave}
                            createFn={this.onCreate}
                            onClose={() => this.refs.addToDashSaveModal.toggle()}
                        />
                    </ModalWithTrigger>
                </Tooltip>
            ]);
        }

        // history icon on saved cards
        if (!isNew) {
            buttonSections.push([
                <Tooltip key="history" tooltip="Revision history">
                    <ModalWithTrigger
                        ref="cardHistory"
                        triggerElement={<span className="text-brand-hover"><Icon name="history" size={18} /></span>}
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
                </Tooltip>
            ]);
        }

        // query mode toggle
        buttonSections.push([
            <QueryModeButton
                key="queryModeToggle"
                mode={this.props.card.dataset_query.type}
                allowNativeToQuery={isNew && !isDirty}
                allowQueryToNative={tableMetadata ?
                    // if a table is selected, only enable if user has native write permissions for THAT database
                    tableMetadata.db && tableMetadata.db.native_permissions === "write" :
                    // if no table is selected, only enable if user has native write permissions for ANY database
                    _.any(databases, (db) => db.native_permissions === "write")
                }
                nativeForm={this.props.result && this.props.result.data && this.props.result.data.native_form}
                onSetMode={this.props.setQueryModeFn}
                tableMetadata={tableMetadata}
            />
        ]);

        // data reference button
        var dataReferenceButtonClasses = cx('mr1 transition-color', {
            'text-brand': this.props.isShowingDataReference,
            'text-brand-hover': !this.state.isShowingDataReference
        });
        buttonSections.push([
            <Tooltip key="dataReference" tooltip="Learn about your data">
                <a className={dataReferenceButtonClasses}>
                    <Icon name='reference' size={16} onClick={this.onToggleDataReference}></Icon>
                </a>
            </Tooltip>
        ]);

        return (
            <ButtonBar buttons={buttonSections} className="Header-buttonSection borderless" />
        );
    }

    onCloseModal = () => {
        this.setState({ modal: null });
    }

    render() {
        return (
            <div className="relative">
                <HeaderBar
                    isEditing={this.props.isEditing}
                    name={this.props.isNew ? "New question" : this.props.card.name}
                    description={this.props.card ? this.props.card.description : null}
                    breadcrumb={(!this.props.card.id && this.props.originalCard) ? (<span className="pl2">started from <a className="link" onClick={this.onFollowBreadcrumb}>{this.props.originalCard.name}</a></span>) : null }
                    buttons={this.getHeaderButtons()}
                    setItemAttributeFn={this.props.onSetCardAttribute}
                    badge={this.props.card.collection &&
                        <Link
                            to={Urls.collection(this.props.card.collection)}
                            className="text-uppercase flex align-center no-decoration"
                            style={{ color: this.props.card.collection.color, fontSize: 12 }}
                        >
                            <Icon name="collection" size={12} style={{ marginRight: "0.5em" }} />
                            {this.props.card.collection.name}
                        </Link>
                    }
                />

                <Modal small isOpen={this.state.modal === "saved"} onClose={this.onCloseModal}>
                    <QuestionSavedModal
                        addToDashboardFn={() => this.setState({ modal: "add-to-dashboard" })}
                        onClose={this.onCloseModal}
                    />
                </Modal>

                <Modal isOpen={this.state.modal === "add-to-dashboard"} onClose={this.onCloseModal}>
                    <AddToDashSelectDashModal
                        card={this.props.card}
                        onClose={this.onCloseModal}
                        onChangeLocation={this.props.onChangeLocation}
                    />
                </Modal>
            </div>
        );
    }
}
