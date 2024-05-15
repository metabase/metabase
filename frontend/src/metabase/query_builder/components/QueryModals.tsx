import { Component } from "react";
import { connect } from "react-redux";
import { t } from "ttag";
import _ from "underscore";

import Modal from "metabase/components/Modal";
import QuestionSavedModal from "metabase/components/QuestionSavedModal";
import { AddToDashSelectDashModal } from "metabase/containers/AddToDashSelectDashModal";
import { MoveModal } from "metabase/containers/MoveModal";
import { SaveQuestionModal } from "metabase/containers/SaveQuestionModal";
import Collections, { ROOT_COLLECTION } from "metabase/entities/collections";
import EntityCopyModal from "metabase/entities/containers/EntityCopyModal";
import Questions from "metabase/entities/questions";
import { CreateAlertModalContent } from "metabase/query_builder/components/AlertModals";
import { ImpossibleToCreateModelModal } from "metabase/query_builder/components/ImpossibleToCreateModelModal";
import NewDatasetModal from "metabase/query_builder/components/NewDatasetModal";
import { QuestionEmbedWidget } from "metabase/query_builder/components/QuestionEmbedWidget";
import { PreviewQueryModal } from "metabase/query_builder/components/view/PreviewQueryModal";
import { MODAL_TYPES } from "metabase/query_builder/constants";
import { getQuestionWithParameters } from "metabase/query_builder/selectors";
import { FilterModal } from "metabase/querying";
import QuestionMoveToast from "metabase/questions/components/QuestionMoveToast";
import ArchiveQuestionModal from "metabase/questions/containers/ArchiveQuestionModal";
import EditEventModal from "metabase/timelines/questions/containers/EditEventModal";
import MoveEventModal from "metabase/timelines/questions/containers/MoveEventModal";
import NewEventModal from "metabase/timelines/questions/containers/NewEventModal";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { Alert, Card, CollectionId, User } from "metabase-types/api";
import type {
  QueryBuilderMode,
  QueryBuilderUIControls,
  State,
} from "metabase-types/store";

import type { UpdateQuestionOpts } from "../actions/core/updateQuestion";

const mapDispatchToProps = {
  setQuestionCollection: Questions.actions.setCollection,
};

const mapStateToProps = (state: State, props: QueryModalsProps) => ({
  questionWithParameters: getQuestionWithParameters(state) as Question,
  initialCollectionId: Collections.selectors.getInitialCollectionId(
    state,
    props,
  ),
});

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
  setUIControls: (opts: Partial<QueryBuilderUIControls>) => void;
  originalQuestion: Question;
  questionWithParameters: Question;
  card: Card;
  onCreate: (question: Question) => Promise<void>;
  onSave: (
    question: Question,
    config?: { rerunQuery: boolean },
  ) => Promise<void>;
  onCloseModal: () => void;
  onOpenModal: (modal: ModalType) => void;
  onChangeLocation: (location: string) => void;
  setQuestionCollection: (
    { id }: Pick<Card, "id">,
    collection: { id: CollectionId },
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

  onQueryChange = (query: Lib.Query) => {
    const { question, updateQuestion } = this.props;
    const nextLegacyQuery = Lib.toLegacyQuery(query);
    const nextQuestion = question.setDatasetQuery(nextLegacyQuery);
    updateQuestion(nextQuestion, { run: true });
  };

  render() {
    const {
      modal,
      modalContext,
      question,
      questionWithParameters,
      initialCollectionId,
      onCloseModal,
      onOpenModal,
      setQueryBuilderMode,
    } = this.props;

    switch (modal) {
      case MODAL_TYPES.SAVE:
        return (
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
              const type = question.type();
              if (type === "model") {
                onCloseModal();
                setQueryBuilderMode("view");
              } else {
                onOpenModal(MODAL_TYPES.SAVED);
              }
            }}
            onClose={onCloseModal}
          />
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
        );
      case MODAL_TYPES.ADD_TO_DASHBOARD:
        return (
          <AddToDashSelectDashModal
            card={this.props.card}
            onClose={onCloseModal}
            onChangeLocation={this.props.onChangeLocation}
          />
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
        );
      case MODAL_TYPES.SAVE_QUESTION_BEFORE_EMBED:
        return (
          <SaveQuestionModal
            question={this.props.question}
            originalQuestion={this.props.originalQuestion}
            onSave={async question => {
              await this.props.onSave(question);
              onCloseModal();
            }}
            onCreate={async question => {
              await this.props.onCreate(question);
              onCloseModal();
            }}
            onClose={onCloseModal}
            multiStep
            initialCollectionId={this.props.initialCollectionId}
          />
        );
      case MODAL_TYPES.FILTERS:
        return (
          <FilterModal
            query={question.query()}
            onSubmit={this.onQueryChange}
            onClose={onCloseModal}
          />
        );
      case MODAL_TYPES.MOVE:
        return (
          <MoveModal
            title={t`Which collection should this be in?`}
            initialCollectionId={question.collectionId() ?? "root"}
            onClose={onCloseModal}
            onMove={(collection: { id: CollectionId }) => {
              this.props.setQuestionCollection(
                { id: question.id() },
                { id: collection.id },
                {
                  notify: {
                    message: (
                      <QuestionMoveToast
                        collectionId={collection.id || ROOT_COLLECTION.id}
                        question={question}
                      />
                    ),
                    undo: false,
                  },
                },
              );
              onCloseModal();
            }}
          />
        );
      case MODAL_TYPES.ARCHIVE:
        return (
          <Modal onClose={onCloseModal}>
            <ArchiveQuestionModal question={question} onClose={onCloseModal} />
          </Modal>
        );
      case MODAL_TYPES.EMBED:
        return (
          <QuestionEmbedWidget card={this.props.card} onClose={onCloseModal} />
        );
      case MODAL_TYPES.CLONE:
        return (
          <Modal onClose={onCloseModal}>
            <EntityCopyModal
              entityType="questions"
              entityObject={{
                ...question.card(),
                collection_id: question.canWrite()
                  ? question.collectionId()
                  : initialCollectionId,
              }}
              copy={async formValues => {
                const object = await this.props.onCreate(
                  questionWithParameters
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
      default:
        return null;
    }
  }
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(mapStateToProps, mapDispatchToProps)(QueryModals);
