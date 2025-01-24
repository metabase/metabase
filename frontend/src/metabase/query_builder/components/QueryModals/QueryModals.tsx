import { useCallback } from "react";
import { push } from "react-router-redux";
import _ from "underscore";

import { getDashboard } from "metabase/api";
import { useGetDefaultCollectionId } from "metabase/collections/hooks";
import Modal from "metabase/components/Modal";
import QuestionSavedModal from "metabase/components/QuestionSavedModal";
import { AddToDashSelectDashModal } from "metabase/containers/AddToDashSelectDashModal";
import { SaveQuestionModal } from "metabase/containers/SaveQuestionModal";
import EntityCopyModal from "metabase/entities/containers/EntityCopyModal";
import { useDispatch, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { CreateAlertModalContent } from "metabase/notifications/AlertModals";
import type { UpdateQuestionOpts } from "metabase/query_builder/actions/core/updateQuestion";
import { ImpossibleToCreateModelModal } from "metabase/query_builder/components/ImpossibleToCreateModelModal";
import NewDatasetModal from "metabase/query_builder/components/NewDatasetModal";
import { PreviewQueryModal } from "metabase/query_builder/components/view/PreviewQueryModal";
import type { QueryModalType } from "metabase/query_builder/constants";
import { MODAL_TYPES } from "metabase/query_builder/constants";
import { getQuestionWithParameters } from "metabase/query_builder/selectors";
import { FilterModal } from "metabase/querying/filters/components/FilterModal";
import ArchiveQuestionModal from "metabase/questions/containers/ArchiveQuestionModal";
import EditEventModal from "metabase/timelines/questions/containers/EditEventModal";
import MoveEventModal from "metabase/timelines/questions/containers/MoveEventModal";
import NewEventModal from "metabase/timelines/questions/containers/NewEventModal";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { Alert, Card, User } from "metabase-types/api";
import type { QueryBuilderMode } from "metabase-types/store";

import { MoveQuestionModal } from "../MoveQuestionModal";

interface QueryModalsProps {
  questionAlerts: Alert[];
  user: User;
  modal: QueryModalType;
  modalContext: number;
  question: Question;
  updateQuestion: (question: Question, config?: UpdateQuestionOpts) => void;
  setQueryBuilderMode: (mode: QueryBuilderMode) => void;
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

  const navigateToDashboardQuestionDashboard = useCallback(
    async (question: Question) => {
      const cardId = question.id();
      const dashboardId = question.dashboardId();
      if (!dashboardId) {
        throw new Error("must provide a valid dashboard question");
      }

      const dashboard = await dispatch(
        getDashboard.initiate({ id: dashboardId }),
      )
        .unwrap()
        .catch(() => undefined); // we can fallback to navigation w/o this info
      const dashcard = dashboard?.dashcards.find(c => c.card_id === cardId);

      if (!dashboard || !dashcard) {
        console.warn(
          "Could not fetch dashcard position on dashboard, falling back to navigation without auto-scrolling",
        );
      }

      const url = Urls.dashboard(
        { id: dashboardId, name: "", ...question.dashboard(), ...dashboard },
        { editMode: true, scrollToDashcard: dashcard?.id },
      );
      dispatch(push(url));
    },
    [dispatch],
  );

  const handleSaveModalCreate = useCallback(
    async (question: Question) => {
      const newQuestion = await onCreate(question);
      const type = question.type();
      const isDashboardQuestion = _.isNumber(question.dashboardId());

      if (type === "model" || type === "metric") {
        onCloseModal();
        setQueryBuilderMode("view");
      } else if (isDashboardQuestion) {
        navigateToDashboardQuestionDashboard(newQuestion);
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
      navigateToDashboardQuestionDashboard,
    ],
  );

  const handleCopySaved = useCallback(
    (newQuestion: Question) => {
      const isDashboardQuestion = _.isNumber(newQuestion.dashboardId());

      if (isDashboardQuestion) {
        navigateToDashboardQuestionDashboard(newQuestion);
      } else {
        onOpenModal(MODAL_TYPES.SAVED);
      }
    },
    [onOpenModal, navigateToDashboardQuestionDashboard],
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
          question={question}
          onSubmit={onQueryChange}
          onClose={onCloseModal}
        />
      );
    case MODAL_TYPES.MOVE:
      return <MoveQuestionModal question={question} onClose={onCloseModal} />;
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
