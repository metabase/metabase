import { useCallback } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";
import _ from "underscore";

import { useGetDefaultCollectionId } from "metabase/collections/hooks";
import Modal from "metabase/components/Modal";
import QuestionSavedModal from "metabase/components/QuestionSavedModal";
import { AddToDashSelectDashModal } from "metabase/containers/AddToDashSelectDashModal";
import { MoveModal } from "metabase/containers/MoveModal";
import { SaveQuestionModal } from "metabase/containers/SaveQuestionModal";
import { ROOT_COLLECTION } from "metabase/entities/collections/constants";
import EntityCopyModal from "metabase/entities/containers/EntityCopyModal";
import Questions from "metabase/entities/questions";
import { useDispatch, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import type { UpdateQuestionOpts } from "metabase/query_builder/actions/core/updateQuestion";
import { CreateAlertModalContent } from "metabase/query_builder/components/AlertModals";
import { ImpossibleToCreateModelModal } from "metabase/query_builder/components/ImpossibleToCreateModelModal";
import NewDatasetModal from "metabase/query_builder/components/NewDatasetModal";
import { PreviewQueryModal } from "metabase/query_builder/components/view/PreviewQueryModal";
import type { QueryModalType } from "metabase/query_builder/constants";
import { MODAL_TYPES } from "metabase/query_builder/constants";
import { getQuestionWithParameters } from "metabase/query_builder/selectors";
import { FilterModal } from "metabase/querying/filters/components/FilterModal";
import QuestionMoveToast from "metabase/questions/components/QuestionMoveToast";
import ArchiveQuestionModal from "metabase/questions/containers/ArchiveQuestionModal";
import EditEventModal from "metabase/timelines/questions/containers/EditEventModal";
import MoveEventModal from "metabase/timelines/questions/containers/MoveEventModal";
import NewEventModal from "metabase/timelines/questions/containers/NewEventModal";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type {
  Alert,
  Card,
  CollectionId,
  DashboardTabId,
  User,
} from "metabase-types/api";
import type {
  QueryBuilderMode,
  QueryBuilderUIControls,
} from "metabase-types/store";

interface QueryModalsProps {
  questionAlerts: Alert[];
  user: User;
  modal: QueryModalType;
  modalContext: number;
  question: Question;
  updateQuestion: (question: Question, config?: UpdateQuestionOpts) => void;
  setQueryBuilderMode: (mode: QueryBuilderMode) => void;
  setUIControls: (opts: Partial<QueryBuilderUIControls>) => void;
  originalQuestion: Question;
  card: Card;
  onCreate: (question: Question) => Promise<Question>;
  onSave: (
    question: Question,
    config?: { rerunQuery: boolean },
  ) => Promise<void>;
  onCloseModal: () => void;
  onOpenModal: (modalType: QueryModalType) => void;
  onChangeLocation: (location: string) => void;
}

export function QueryModals({
  questionAlerts,
  user,
  onSave,
  onCreate,
  updateQuestion,
  modal,
  modalContext,
  card,
  question,
  onCloseModal,
  onOpenModal,
  setQueryBuilderMode,
  originalQuestion,
  onChangeLocation,
}: QueryModalsProps) {
  const dispatch = useDispatch();

  const initialCollectionId = useGetDefaultCollectionId();
  const questionWithParameters = useSelector(getQuestionWithParameters);

  const showAlertsAfterQuestionSaved = useCallback(() => {
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
  }, [onCloseModal, onOpenModal, questionAlerts, user.id]);

  const onQueryChange = useCallback(
    (query: Lib.Query) => {
      const nextLegacyQuery = Lib.toLegacyQuery(query);
      const nextQuestion = question.setDatasetQuery(nextLegacyQuery);
      updateQuestion(nextQuestion, { run: true });
    },
    [question, updateQuestion],
  );

  const handleSaveAndClose = useCallback(
    async (question: Question) => {
      await onSave(question);
      onCloseModal();
    },
    [onCloseModal, onSave],
  );

  const handleCreateAndClose = useCallback(
    async (question: Question) => {
      const newQuestion = await onCreate(question);
      onCloseModal();
      return newQuestion;
    },
    [onCloseModal, onCreate],
  );

  const nativeToDashboarQuestionDashboard = useCallback(
    (question: Question, tabId?: DashboardTabId) => {
      const dashboardId = question.dashboardId();

      if (!dashboardId) {
        throw new Error("must provide a valid dashboard question");
      }

      dispatch(
        push(
          Urls.dashboard(
            { id: dashboardId, name: "" },
            {
              editMode: true,
              addCardWithId: question.id(),
              tabId,
            },
          ),
        ),
      );
    },
    [dispatch],
  );

  const handleSaveModalCreate = useCallback(
    async (
      question: Question,
      options?: { dashboardTabId?: DashboardTabId },
    ) => {
      const newQuestion = await onCreate(question);
      const type = question.type();
      const isDashboardQuestion = _.isNumber(question.dashboardId());

      if (type === "model" || type === "metric") {
        onCloseModal();
        setQueryBuilderMode("view");
      } else if (isDashboardQuestion) {
        nativeToDashboarQuestionDashboard(newQuestion, options?.dashboardTabId);
      } else {
        onOpenModal(MODAL_TYPES.SAVED);
      }

      return newQuestion;
    },
    [
      onCloseModal,
      onCreate,
      onOpenModal,
      setQueryBuilderMode,
      nativeToDashboarQuestionDashboard,
    ],
  );

  const handleCopySaved = useCallback(
    (newQuestion: Question) => {
      const isDashboardQuestion = _.isNumber(newQuestion.dashboardId());

      if (isDashboardQuestion) {
        nativeToDashboarQuestionDashboard(newQuestion);
      } else {
        onOpenModal(MODAL_TYPES.SAVED);
      }
    },
    [onOpenModal, nativeToDashboarQuestionDashboard],
  );

  switch (modal) {
    case MODAL_TYPES.SAVE:
      return (
        <SaveQuestionModal
          question={question}
          originalQuestion={originalQuestion}
          initialCollectionId={initialCollectionId}
          onSave={handleSaveAndClose}
          onCreate={handleSaveModalCreate}
          onClose={onCloseModal}
          opened={true}
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
          question={question}
          originalQuestion={originalQuestion}
          initialCollectionId={initialCollectionId}
          onSave={async question => {
            await onSave(question);
            onOpenModal(MODAL_TYPES.ADD_TO_DASHBOARD);
          }}
          onCreate={async question => {
            const newQuestion = await onCreate(question);
            onOpenModal(MODAL_TYPES.ADD_TO_DASHBOARD);
            return newQuestion;
          }}
          onClose={onCloseModal}
          opened={true}
          multiStep
        />
      );
    case MODAL_TYPES.ADD_TO_DASHBOARD:
      return (
        <AddToDashSelectDashModal
          card={card}
          onClose={onCloseModal}
          onChangeLocation={onChangeLocation}
        />
      );
    case MODAL_TYPES.CREATE_ALERT:
      return (
        <Modal medium onClose={onCloseModal}>
          <CreateAlertModalContent
            onCancel={onCloseModal}
            onAlertCreated={onCloseModal}
          />
        </Modal>
      );
    case MODAL_TYPES.SAVE_QUESTION_BEFORE_ALERT:
      return (
        <SaveQuestionModal
          question={question}
          originalQuestion={originalQuestion}
          onSave={async question => {
            await onSave(question);
            showAlertsAfterQuestionSaved();
          }}
          onCreate={async question => {
            const newQuestion = await onCreate(question);
            showAlertsAfterQuestionSaved();
            return newQuestion;
          }}
          onClose={onCloseModal}
          opened={true}
          multiStep
          initialCollectionId={initialCollectionId}
        />
      );
    case MODAL_TYPES.SAVE_QUESTION_BEFORE_EMBED:
      return (
        <SaveQuestionModal
          question={question}
          originalQuestion={originalQuestion}
          onSave={handleSaveAndClose}
          onCreate={handleCreateAndClose}
          onClose={onCloseModal}
          opened={true}
          multiStep
          initialCollectionId={initialCollectionId}
        />
      );
    case MODAL_TYPES.FILTERS:
      return (
        <FilterModal
          query={question.query()}
          onSubmit={onQueryChange}
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
            dispatch(
              Questions.actions.setCollection(
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
              ),
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
              if (!questionWithParameters) {
                return;
              }

              const object = await onCreate(
                questionWithParameters
                  .setDisplayName(formValues.name)
                  .setCollectionId(formValues.collection_id)
                  .setDashboardId(formValues.dashboard_id)
                  .setDescription(formValues.description || null),
              );

              return object;
            }}
            onClose={onCloseModal}
            onSaved={handleCopySaved}
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
