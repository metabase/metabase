import React, { Component } from "react";
import PropTypes from "prop-types";
import { Link } from "react-router";

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
import Button from "metabase/components/Button";

export default class CardHeader extends Component {
    constructor(props, context) {
        super(props, context);

        this.state = {
            recentlySaved: null,
            modal: null,
            revisions: null
        };
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
        // isNew: PropTypes.bool.isRequired,
        // isDirty: PropTypes.bool.isRequired
    };

    componentWillUnmount() {
        clearTimeout(this.timeout);
        if (this.requestPromise) {
            this.requestPromise.cancel();
        }
    }

    resetStateOnTimeout = () => {
        // clear any previously set timeouts then start a new one
        clearTimeout(this.timeout);
        this.timeout = setTimeout(() =>
            this.setState({ recentlySaved: null })
        , 5000);
    }

    // onCreate = (card, addToDash) => {
    //     if (card.dataset_query.query) {
    //         Query.cleanQuery(card.dataset_query.query);
    //     }
    //
    //     // TODO: reduxify
    //     this.requestPromise = cancelable(CardApi.create(card));
    //     return this.requestPromise.then(newCard => {
    //         this.props.notifyCardCreatedFn(newCard);
    //
    //         this.setState({
    //             recentlySaved: "created",
    //             modal: addToDash ? "add-to-dashboard" : "saved"
    //         }, this.resetStateOnTimeout);
    //     });
    // }

    onSave = (card, addToDash) => {
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
        this.requestPromise = cancelable(CardApi.update(card));
        return this.requestPromise.then(updatedCard => {
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
    };

    onBeginEditing = () => {
        this.props.onBeginEditing();
    };

    onCancel = async () => {
        if (this.props.fromUrl) {
            this.onGoBack();
        } else {
            this.props.onCancelEditing();
        }
    };

    onDelete = async () => {
        // TODO: reduxify
        await CardApi.delete({ 'cardId': this.props.card.id });
        this.onGoBack();
        MetabaseAnalytics.trackEvent("QueryBuilder", "Delete");
    };

    onFollowBreadcrumb = () => {
        this.props.onRestoreOriginalQuery();
    };

    onToggleDataReference = () => {
        this.props.toggleDataReferenceFn();
    };

    onGoBack = () => {
        this.props.onChangeLocation(this.props.fromUrl || "/");
    };

    onFetchRevisions = async ({ entity, id }) => {
        // TODO: reduxify
        var revisions = await RevisionApi.list({ entity, id });
        this.setState({ revisions });
    };

    onRevertToRevision = ({ entity, id, revision_id }) => {
        // TODO: reduxify
        return RevisionApi.revert({ entity, id, revision_id });
    };

    onRevertedRevision = () => {
        this.props.reloadCardFn();
        this.refs.cardHistory.toggle();
    };

    getHeaderButtons = () => {
        const { card ,isNew, isDirty, isEditing, databases } = this.props;
        const database = _.findWhere(databases, { id: card && card.dataset_query && card.dataset_query.database });

        const SaveNewCardButton = () =>
            <ModalWithTrigger
                form
                key="save"
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
                />
            </ModalWithTrigger>;

        const ConfirmationOfSavedCard = () =>
            <button
                key="recentlySaved"
                className="cursor-pointer bg-white text-success text-strong text-uppercase"
            >
                <span>
                    <Icon name='check' size={12}/>
                    <span className="ml1">Saved</span>
                </span>
            </button>;

        const EditCardButton = () =>
            <Tooltip key="edit" tooltip="Edit question">
                <a className="cursor-pointer text-brand-hover" onClick={this.onBeginEditing}>
                    <Icon name="pencil" size={16}/>
                </a>
            </Tooltip>;

        const SaveEditedCardButton = () =>
            <ActionButton
                key="save"
                actionFn={() => this.onSave(this.props.card, false)}
                className="cursor-pointer text-brand-hover bg-white text-grey-4 text-uppercase"
                normalText="SAVE CHANGES"
                activeText="Saving…"
                failedText="Save failed"
                successText="Saved"
            />;

        const CancelEditingButton = () =>
            <a key="cancel" className="cursor-pointer text-brand-hover text-grey-4 text-uppercase" onClick={this.onCancel}>
                CANCEL
            </a>;

        const DeleteCardButton = () =>
            <ArchiveQuestionModal questionId={this.props.card.id}/>;

        const MoveQuestionToCollectionButton = () =>
            <ModalWithTrigger
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
            </ModalWithTrigger>;

        const ToggleTemplateTagsEditorButton = () => {
            const parametersButtonClasses = cx('transition-color', {
                'text-brand': this.props.uiControls.isShowingTemplateTagsEditor,
                'text-brand-hover': !this.props.uiControls.isShowingTemplateTagsEditor
            });
            return (
                <Tooltip key="parameterEdititor" tooltip="Variables">
                    <a className={parametersButtonClasses}>
                        <Icon name="variable" size={16} onClick={this.props.toggleTemplateTagsEditor}/>
                    </a>
                </Tooltip>
            );
        };

        const AddSavedCardToDashboardButton = () =>
            <Tooltip key="addtodash" tooltip="Add to dashboard">
                    <span data-metabase-event={"QueryBuilder;AddToDash Modal;normal"} className="cursor-pointer text-brand-hover" onClick={() => this.setState({ modal: "add-to-dashboard" })}>
                        <Icon name="addtodash" size={16} />
                    </span>
            </Tooltip>;

        const SaveNewCardAndAddToDashboardButton = () =>
            <Tooltip key="addtodashsave" tooltip="Add to dashboard">
                <ModalWithTrigger
                    triggerClasses="h4 text-brand-hover text-uppercase"
                    triggerElement={
                        <Button data-metabase-event="QueryBuilder;AddToDash Modal;pre-save"
                                icon="addtodash"
                                iconSize={16}
                                onlyIcon
                        />
                    }
                >
                    <SaveQuestionModal
                        card={this.props.card}
                        originalCard={this.props.originalCard}
                        tableMetadata={this.props.tableMetadata}
                        addToDashboard={true}
                        saveFn={this.onSave}
                        createFn={this.onCreate}
                    />
                </ModalWithTrigger>
            </Tooltip>;

        // Don't treat as functional component due to refs
        const getHistoryRevisionsButton = () =>
            <Tooltip key="history" tooltip="Revision history">
                <ModalWithTrigger
                    ref="cardHistory"
                    triggerElement={<Button icon="history" onlyIcon />}
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
            </Tooltip>;

        const DataReferenceButton = () => {
            const dataReferenceButtonClasses = cx('transition-color', {
                'text-brand': this.props.isShowingDataReference,
                'text-brand-hover': !this.state.isShowingDataReference
            });

            return (
                <Tooltip key="dataReference" tooltip="Learn about your data">
                    <a className={dataReferenceButtonClasses}>
                        <Icon name='reference' size={16} onClick={this.onToggleDataReference} />
                    </a>
                </Tooltip>
            );
        };

        const isNewCardThatCanBeSaved = isNew && isDirty;
        const isSaved = !isNew;
        const isEditableSavedCard = isSaved && card.can_write;
        const isNativeQuery = Query.isNative(card && card.dataset_query);
        const isNativeQueryWithParameters = isNativeQuery && database && _.contains(database.features, "native-parameters");

        const getPersistenceButtons = () => {
            if (isEditableSavedCard) {
                if (!isEditing) {
                    if (this.state.recentlySaved) {
                        return [ <ConfirmationOfSavedCard /> ];
                    } else {
                        return [ <EditCardButton key="edit" /> ];
                    }
                } else {
                    return [
                        <SaveEditedCardButton />,
                        <CancelEditingButton />,
                        <DeleteCardButton />,
                        <MoveQuestionToCollectionButton />
                    ]
                }
            } else {
                return [];
            }
        };

        const buttons = [
            isNewCardThatCanBeSaved && <SaveNewCardButton />,
            ...getPersistenceButtons(),
            isNativeQueryWithParameters && <ToggleTemplateTagsEditorButton />,
            isSaved && !isEditing && <AddSavedCardToDashboardButton key="addtodash" />,
            isNewCardThatCanBeSaved && <SaveNewCardAndAddToDashboardButton />,
            // TODO: See what kind of modifications the revisions feature requires
            isSaved && getHistoryRevisionsButton(),
            // TODO: See how SQL will be supported and move this to the CardEditor banner
            // <QueryModeToggleButton />,
            <DataReferenceButton key="datareference" />
        ].filter(_.isObject);

        return (
            <ButtonBar buttons={buttons.map(b => [b])} className="mr2 pr1 borderless" />
        );
    };

    onCloseModal = () => {
        this.setState({ modal: null });
    };

    render() {
        const badgeItemStyle = "text-uppercase flex align-center no-decoration text-bold";
        const description = this.props.card ? this.props.card.description : null;

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
                        <div className="flex">
                            <Link
                                to={Urls.collection(this.props.card.collection)}
                                className={badgeItemStyle}
                                style={{color: this.props.card.collection.color, fontSize: 12}}
                            >
                                <Icon name="collection" size={14} style={{marginRight: "0.5em"}}/>
                                {this.props.card.collection.name}
                            </Link>
                            { description &&
                                <div
                                    className={cx("ml2", badgeItemStyle)}
                                    style={{fontSize: 12}}
                                >
                                    <Icon name="infooutlined" size={14} style={{marginRight: "0.5em"}}/>
                                    Details
                                </div>
                            }
                        </div>
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
