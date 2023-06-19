import { Component } from "react";
import { connect } from "react-redux";

import { t } from "ttag";
import _ from "underscore";

import Questions from "metabase/entities/questions";
import { ROOT_COLLECTION } from "metabase/entities/collections";

import { MODAL_TYPES } from "metabase/query_builder/constants";

import Modal from "metabase/components/Modal";

import SaveQuestionModal from "metabase/containers/SaveQuestionModal";
import QuestionSavedModal from "metabase/components/QuestionSavedModal";
import AddToDashSelectDashModal from "metabase/containers/AddToDashSelectDashModal";

import CollectionMoveModal from "metabase/containers/CollectionMoveModal";
import ArchiveQuestionModal from "metabase/questions/containers/ArchiveQuestionModal";
import QuestionEmbedWidget from "metabase/query_builder/containers/QuestionEmbedWidget";

import { CreateAlertModalContent } from "metabase/query_builder/components/AlertModals";
import { ImpossibleToCreateModelModal } from "metabase/query_builder/components/ImpossibleToCreateModelModal";
import NewDatasetModal from "metabase/query_builder/components/NewDatasetModal";
import EntityCopyModal from "metabase/entities/containers/EntityCopyModal";
import BulkFilterModal from "metabase/query_builder/components/filters/modals/BulkFilterModal";
import NewEventModal from "metabase/timelines/questions/containers/NewEventModal";
import EditEventModal from "metabase/timelines/questions/containers/EditEventModal";
import MoveEventModal from "metabase/timelines/questions/containers/MoveEventModal";
import PreviewQueryModal from "metabase/query_builder/components/view/PreviewQueryModal";
import ConvertQueryModal from "metabase/query_builder/components/view/ConvertQueryModal";
import QuestionMoveToast from "metabase/questions/components/QuestionMoveToast";
import { Alert, Card, Collection, User } from "metabase-types/api";
import { QueryBuilderMode } from "metabase-types/store";
import StructuredQuery from "metabase-lib/queries/StructuredQuery";
import Question from "metabase-lib/Question";
import { UpdateQuestionOpts } from "../actions/core/updateQuestion";

const mapDispatchToProps = {
  setQuestionCollection: Questions.actions.setCollection,
};

type ModalType = typeof MODAL_TYPES[keyof typeof MODAL_TYPES];

interface QueryModalsProps {
  questionAlerts: Alert[];
  user: User;
  modal: ModalType;
  modalContext: number;
  question: Question;
  initialCollectionId: number;
  updateQuestion: (question: Question, config?: UpdateQuestionOpts) => void;
  setQueryBuilderMode: (mode: QueryBuilderMode) => void;
  originalQuestion: Question | null;
  card: Card;
  onCreate: (question: Question) => void;
  onSave: (question: Question, config?: { rerunQuery: boolean }) => void;
  onCloseModal: () => void;
  onOpenModal: (modal: ModalType) => void;
  onChangeLocation: (location: string) => void;
  setQuestionCollection: (
    { id }: Pick<Card, "id">,
    collection: Collection,
    opts: Record<string, unknown>,
  ) => void;
}

class QueryModals extends Component<QueryModalsProps> {
  showAlertsAfterQuestionSaved = () => {
    const { questionAlerts, user, onCloseModal, onOpenModal } = this.props;

    const hasAlertsCreatedByCurrentUser = _.any(
      questionAlerts,
      alert => alert.creator.id === user.id,
    );

    if (hasAlertsCreatedByCurrentUser) {
      // TODO Atte Keinänen 11/10/17: The question was replaced and there is already an alert created by current user.
      // Should we show pop up the alerts list in this case or do nothing (as we do currently)?
      onCloseModal();
    } else {
      // HACK: in a timeout because save modal closes itself
      setTimeout(() => onOpenModal(MODAL_TYPES.CREATE_ALERT));
    }
  };

  onQueryChange = (query: StructuredQuery) => {
    const question = query.question();
    this.props.updateQuestion(question, { run: true });
  };

  render() {
    const {
      modal,
      modalContext,
      question,
      initialCollectionId,
      onCloseModal,
      onOpenModal,
      updateQuestion,
      setQueryBuilderMode,
    } = this.props;

    // for models, we need to use the card's original dataset_query, not the model's dataset_query
    // since it only refers to a source table rather than anything else
    const questionCopy = question.isDataset()
      ? new Question(this.props.card)
      : question;

    switch (modal) {
      case MODAL_TYPES.SAVE:
        return (
          <Modal form onClose={onCloseModal}>
            <SaveQuestionModal
              question={this.props.question}
              originalQuestion={this.props.originalQuestion}
              initialCollectionId={this.props.initialCollectionId}
              onSave={async (question: Question) => {
                // if saving modified question, don't show "add to dashboard" modal
                await this.props.onSave(question);
                onCloseModal();
              }}
              onCreate={async question => {
                await this.props.onCreate(question);
                if (question.isDataset()) {
                  onCloseModal();
                  setQueryBuilderMode("view");
                } else {
                  onOpenModal(MODAL_TYPES.SAVED);
                }
              }}
              onClose={onCloseModal}
            />
          </Modal>
        );
      case MODAL_TYPES.SAVED:
        return (
          <Modal small onClose={onCloseModal}>
            <QuestionSavedModal
              onClose={onCloseModal}
              addToDashboard={() => {
                onOpenModal(MODAL_TYPES.ADD_TO_DASHBOARD);
              }}
            />
          </Modal>
        );
      case MODAL_TYPES.ADD_TO_DASHBOARD_SAVE:
        return (
          <Modal onClose={onCloseModal}>
            <SaveQuestionModal
              question={this.props.question}
              originalQuestion={this.props.originalQuestion}
              initialCollectionId={this.props.initialCollectionId}
              onSave={async question => {
                await this.props.onSave(question);
                onOpenModal(MODAL_TYPES.ADD_TO_DASHBOARD);
              }}
              onCreate={async question => {
                await this.props.onCreate(question);
                onOpenModal(MODAL_TYPES.ADD_TO_DASHBOARD);
              }}
              onClose={onCloseModal}
              multiStep
            />
          </Modal>
        );
      case MODAL_TYPES.ADD_TO_DASHBOARD:
        return (
          <Modal onClose={onCloseModal}>
            <AddToDashSelectDashModal
              card={this.props.card}
              onClose={onCloseModal}
              onChangeLocation={this.props.onChangeLocation}
            />
          </Modal>
        );
      case MODAL_TYPES.CREATE_ALERT:
        return (
          <Modal full onClose={onCloseModal}>
            <CreateAlertModalContent
              onCancel={onCloseModal}
              onAlertCreated={onCloseModal}
            />
          </Modal>
        );
      case MODAL_TYPES.SAVE_QUESTION_BEFORE_ALERT:
        return (
          <Modal onClose={onCloseModal}>
            <SaveQuestionModal
              question={this.props.question}
              originalQuestion={this.props.originalQuestion}
              onSave={async question => {
                await this.props.onSave(question);
                this.showAlertsAfterQuestionSaved();
              }}
              onCreate={async question => {
                await this.props.onCreate(question);
                this.showAlertsAfterQuestionSaved();
              }}
              onClose={onCloseModal}
              multiStep
              initialCollectionId={this.props.initialCollectionId}
            />
          </Modal>
        );
      case MODAL_TYPES.SAVE_QUESTION_BEFORE_EMBED:
        return (
          <Modal onClose={onCloseModal}>
            <SaveQuestionModal
              question={this.props.question}
              originalQuestion={this.props.originalQuestion}
              onSave={async question => {
                await this.props.onSave(question);
                onOpenModal(MODAL_TYPES.EMBED);
              }}
              onCreate={async question => {
                await this.props.onCreate(question);
                onOpenModal(MODAL_TYPES.EMBED);
              }}
              onClose={onCloseModal}
              multiStep
              initialCollectionId={this.props.initialCollectionId}
            />
          </Modal>
        );
      case MODAL_TYPES.FILTERS:
        return (
          <Modal fit onClose={onCloseModal}>
            <BulkFilterModal
              question={question}
              onQueryChange={this.onQueryChange}
              onClose={onCloseModal}
            />
          </Modal>
        );

      case MODAL_TYPES.MOVE:
        return (
          <Modal onClose={onCloseModal}>
            <CollectionMoveModal
              title={t`Which collection should this be in?`}
              initialCollectionId={question.collectionId()}
              onClose={onCloseModal}
              onMove={(collection: Collection) => {
                this.props.setQuestionCollection(
                  { id: question.id() },
                  collection,
                  {
                    notify: {
                      message: (
                        <QuestionMoveToast
                          isModel={question.isDataset()}
                          collectionId={collection.id || ROOT_COLLECTION.id}
                        />
                      ),
                      undo: false,
                    },
                  },
                );
                onCloseModal();
              }}
            />
          </Modal>
        );
      case MODAL_TYPES.ARCHIVE:
        return (
          <Modal onClose={onCloseModal}>
            <ArchiveQuestionModal question={question} onClose={onCloseModal} />
          </Modal>
        );
      case MODAL_TYPES.EMBED:
        return (
          <Modal full onClose={onCloseModal}>
            <QuestionEmbedWidget
              card={this.props.card}
              onClose={onCloseModal}
            />
          </Modal>
        );
      case MODAL_TYPES.CLONE:
        return (
          <Modal onClose={onCloseModal}>
            <EntityCopyModal
              entityType="questions"
              entityObject={{
                ...questionCopy.card(),
                collection_id: questionCopy.canWrite()
                  ? questionCopy.collectionId()
                  : initialCollectionId,
              }}
              copy={async formValues => {
                const object = await this.props.onCreate(
                  questionCopy
                    .setDisplayName(formValues.name)
                    .setCollectionId(formValues.collection_id)
                    .setDescription(formValues.description || null),
                );
                return { payload: { object } };
              }}
              onClose={onCloseModal}
              onSaved={() => onOpenModal(MODAL_TYPES.SAVED)}
            />
          </Modal>
        );
      case MODAL_TYPES.TURN_INTO_DATASET:
        return (
          <Modal small onClose={onCloseModal}>
            <NewDatasetModal onClose={onCloseModal} />
          </Modal>
        );
      case MODAL_TYPES.CAN_NOT_CREATE_MODEL:
        return (
          <Modal onClose={onCloseModal}>
            <ImpossibleToCreateModelModal onClose={onCloseModal} />
          </Modal>
        );
      case MODAL_TYPES.NEW_EVENT:
        return (
          <Modal onClose={onCloseModal}>
            <NewEventModal
              cardId={question.id()}
              collectionId={question.collectionId()}
              onClose={onCloseModal}
            />
          </Modal>
        );
      case MODAL_TYPES.EDIT_EVENT:
        return (
          <Modal onClose={onCloseModal}>
            <EditEventModal eventId={modalContext} onClose={onCloseModal} />
          </Modal>
        );
      case MODAL_TYPES.MOVE_EVENT:
        return (
          <Modal onClose={onCloseModal}>
            <MoveEventModal
              eventId={modalContext}
              collectionId={question.collectionId()}
              onClose={onCloseModal}
            />
          </Modal>
        );
      case MODAL_TYPES.PREVIEW_QUERY:
        return (
          <Modal fit onClose={onCloseModal}>
            <PreviewQueryModal onClose={onCloseModal} />
          </Modal>
        );
      case MODAL_TYPES.CONVERT_QUERY:
        return (
          <Modal fit onClose={onCloseModal}>
            <ConvertQueryModal
              onUpdateQuestion={updateQuestion}
              onClose={onCloseModal}
            />
          </Modal>
        );
      default:
        return null;
    }
  }
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(null, mapDispatchToProps)(QueryModals);
