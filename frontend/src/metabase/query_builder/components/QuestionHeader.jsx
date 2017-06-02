import React, { Component } from "react";
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
import type Question from "metabase-lib/lib/Question";
import type {Card} from "metabase/meta/types/Card";

type Props = {
    question: Question,
    // TODO Atte Keinänen 5/25/17: Replace originalCard with `Question` object
    originalCard?: Card,
    isEditing: boolean,
    // tableMetadata isn't present if the query is a native query or the metadata is still loading
    tableMetadata?: TableMetadata,
    onSetCardAttribute: (string, any) => void,
    reloadCardFn: () => void,
    // TODO Atte Keinänen 5/25/17: Define a union type for allowed query modes
    setQueryModeFn: (string) => void,
    isShowingDataReference: boolean,
    toggleDataReferenceFn: () => void,
    onChangeLocation: (string) => void,
    isNew: boolean,
    isEditing: boolean,
    isDirty: boolean
}

export default class QuestionHeader extends Component {
    props: Props;
    
    constructor(props, context) {
        super(props, context);

        this.state = {
            recentlySaved: null,
            modal: null,
            revisions: null
        };
    }
    
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
    };

    // onCreate = (question, addToDash) => {
    //     if (question.datasetQuery().query) {
    //         Query.cleanQuery(question.datasetQuery().query);
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
        // if (question.datasetQuery().type === "native" && question.datasetQuery().query) {
        //     delete question.datasetQuery().query;
        // } else if (question.datasetQuery().type === "query" && question.datasetQuery().native) {
        //     delete question.datasetQuery().native;
        // }

        const { fromUrl, notifyCardUpdatedFn } = this.props;

        const datasetQuery = card.dataset_query;
        if (datasetQuery.query) {
            Query.cleanQuery(datasetQuery.query);
        }

        // TODO: reduxify
        this.requestPromise = cancelable(CardApi.update(card));
        return this.requestPromise.then(updatedCard => {
            if (fromUrl) {
                this.onGoBack();
                return;
            }

            notifyCardUpdatedFn(updatedCard);

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
        const {
            question,
            originalCard,
            isNew,
            isDirty,
            isEditing,
            uiControls,
            toggleTemplateTagsEditor,
            isShowingDataReference,
            onSetCardAttribute
        } = this.props;

        const database = question && question.query().database();
        const card = question.card();

        // TODO Atte Keinänen 5/20/17 Add multi-query support to all components that need metadata
        // This only fetches the table metadata of first available query
        const tableMetadata = question.query().tableMetadata();

        const SaveNewCardButton = () =>
            <ModalWithTrigger
                form
                key="save"
                triggerClasses="h4 text-grey-4 text-brand-hover text-uppercase"
                triggerElement="Save"
            >
                <SaveQuestionModal
                    card={card}
                    originalCard={originalCard}
                    tableMetadata={tableMetadata}
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
                actionFn={() => this.onSave(card, false)}
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
            <ArchiveQuestionModal questionId={card.id}/>;

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
                    questionId={card.id}
                    initialCollectionId={card && card.collection_id}
                    setCollection={(questionId, collection) => {
                        onSetCardAttribute('collection', collection)
                        onSetCardAttribute('collection_id', collection.id)
                    }}
                />
            </ModalWithTrigger>;

        const ToggleTemplateTagsEditorButton = () => {
            const parametersButtonClasses = cx('transition-color', {
                'text-brand': uiControls.isShowingTemplateTagsEditor,
                'text-brand-hover': !uiControls.isShowingTemplateTagsEditor
            });
            return (
                <Tooltip key="parameterEdititor" tooltip="Variables">
                    <a className={parametersButtonClasses}>
                        <Icon name="variable" size={16} onClick={toggleTemplateTagsEditor}/>
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
                        card={card}
                        originalCard={originalCard}
                        tableMetadata={tableMetadata}
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
                        entityId={card.id}
                        onFetchRevisions={this.onFetchRevisions}
                        onRevertToRevision={this.onRevertToRevision}
                        onClose={() => this.refs.cardHistory.toggle()}
                        onReverted={this.onRevertedRevision}
                    />
                </ModalWithTrigger>
            </Tooltip>;

        const DataReferenceButton = () => {
            const dataReferenceButtonClasses = cx('transition-color', {
                'text-brand': isShowingDataReference,
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
        const isEditableSavedCard = isSaved && question.canWrite();
        const isNativeQuery = Query.isNative(question && question.query().datasetQuery());
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
            // TODO: See how SQL will be supported and move this to the QuestionEditor banner
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
        const { question, originalCard, isEditing, isNew, onSetCardAttribute, onChangeLocation } = this.props;
        const badgeItemStyle = "text-uppercase flex align-center no-decoration text-bold";
        const description = question.card().description;

        return (
            <div className="relative">
                <HeaderBar
                    isEditing={isEditing}
                    name={isNew ? "New question" : question.card().name}
                    description={description}
                    breadcrumb={(!question.card().id && originalCard) ? (<span className="pl2">started from <a className="link" onClick={this.onFollowBreadcrumb}>{originalCard.name}</a></span>) : null }
                    buttons={this.getHeaderButtons()}
                    setItemAttributeFn={onSetCardAttribute}
                    badge={question.card().collection &&
                        <div className="flex">
                            <Link
                                to={Urls.collection(question.card().collection)}
                                className={badgeItemStyle}
                                style={{color: question.card().collection.color, fontSize: 12}}
                            >
                                <Icon name="collection" size={14} style={{marginRight: "0.5em"}}/>
                                {question.card().collection.name}
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
                        card={question.card()}
                        onClose={this.onCloseModal}
                        onChangeLocation={onChangeLocation}
                    />
                </Modal>
            </div>
        );
    }
}
