import type React from "react";
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
import { CreateOrEditQuestionAlertModal } from "metabase/notifications/modals";
import { ImpossibleToCreateModelModal } from "metabase/query_builder/components/ImpossibleToCreateModelModal";
import { NewDatasetModal } from "metabase/query_builder/components/NewDatasetModal";
import { QuestionEmbedWidget } from "metabase/query_builder/components/QuestionEmbedWidget";
import { PreviewQueryModal } from "metabase/query_builder/components/view/PreviewQueryModal";
import type { QueryModalType } from "metabase/query_builder/constants";
import { MODAL_TYPES } from "metabase/query_builder/constants";
import { getQuestionWithParameters } from "metabase/query_builder/selectors";
import ArchiveQuestionModal from "metabase/questions/containers/ArchiveQuestionModal";
import EditEventModal from "metabase/timelines/questions/containers/EditEventModal";
import MoveEventModal from "metabase/timelines/questions/containers/MoveEventModal";
import NewEventModal from "metabase/timelines/questions/containers/NewEventModal";
import type Question from "metabase-lib/v1/Question";
import type { Card, DashboardTabId } from "metabase-types/api";
import type { QueryBuilderMode } from "metabase-types/store";

import { MoveQuestionModal } from "../MoveQuestionModal";

type OnCreateOptions = { dashboardTabId?: DashboardTabId | undefined };

interface QueryModalsProps {
  modal: QueryModalType;
  modalContext: number;
  question: Question;
  setQueryBuilderMode: (mode: QueryBuilderMode) => void;
  originalQuestion: Question;
  card: Card;
  onCreate: (
    question: Question,
    options?: OnCreateOptions,
  ) => Promise<Question>;
  onSave: (
    question: Question,
    config?: { rerunQuery: boolean },
  ) => Promise<void>;
  onCloseModal: () => void;
  onOpenModal: (modalType: QueryModalType) => void;
  onChangeLocation: (location: string) => void;
}

export function QueryModals({
  onSave,
  onCreate,
  modal,
  modalContext,
  card,
  question,
  onCloseModal,
  onOpenModal,
  setQueryBuilderMode,
  originalQuestion,
  onChangeLocation,
}: QueryModalsProps): React.JSX.Element {
  const dispatch = useDispatch();

  const initialCollectionId = useGetDefaultCollectionId();
  const questionWithParameters = useSelector(getQuestionWithParameters);

  const handleSaveAndClose = useCallback(
    async (question: Question) => {
      await onSave(question);
      onCloseModal();
    },
    [onCloseModal, onSave],
  );

  const handleCreateAndClose = useCallback(
    async (question: Question, options?: OnCreateOptions) => {
      const newQuestion = await onCreate(question, options);
      onCloseModal();
      return newQuestion;
    },
    [onCloseModal, onCreate],
  );

  const navigateToDashboardQuestionDashboard = useCallback(
    async (question: Question, tabId?: DashboardTabId | undefined) => {
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
      const dashcard = dashboard?.dashcards.find((c) => c.card_id === cardId);

      if (!dashboard || !dashcard) {
        console.warn(
          "Could not fetch dashcard position on dashboard, falling back to navigation without auto-scrolling",
        );
      }

      const url = Urls.dashboard(
        { id: dashboardId, name: "", ...question.dashboard(), ...dashboard },
        { editMode: true, scrollToDashcard: dashcard?.id, tabId },
      );
      dispatch(push(url));
    },
    [dispatch],
  );

  const handleSaveModalCreate = useCallback(
    async (question: Question, options?: OnCreateOptions) => {
      const newQuestion = await onCreate(question, options);
      const type = question.type();
      const isDashboardQuestion = _.isNumber(question.dashboardId());

      if (type === "model" || type === "metric") {
        onCloseModal();
        setQueryBuilderMode("view");
      } else if (isDashboardQuestion) {
        navigateToDashboardQuestionDashboard(
          newQuestion,
          options?.dashboardTabId,
        );
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
    (
      newQuestion: Question,
      options?: {
        dashboardTabId?: DashboardTabId | undefined;
      },
    ) => {
      const isDashboardQuestion = _.isNumber(newQuestion.dashboardId());

      if (isDashboardQuestion) {
        navigateToDashboardQuestionDashboard(
          newQuestion,
          options?.dashboardTabId,
        );
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
          onSave={async (question) => {
            await onSave(question);
            onOpenModal(MODAL_TYPES.ADD_TO_DASHBOARD);
          }}
          onCreate={async (question, options) => {
            const newQuestion = await onCreate(question, options);
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
        <CreateOrEditQuestionAlertModal
          onAlertCreated={onCloseModal}
          onClose={onCloseModal}
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
            copy={async (formValues) => {
              if (!questionWithParameters) {
                return;
              }

              const question = questionWithParameters
                .setDisplayName(formValues.name)
                .setCollectionId(formValues.collection_id)
                .setDashboardId(formValues.dashboard_id)
                .setDescription(formValues.description || null);

              const object = await onCreate(question, {
                dashboardTabId: formValues.dashboard_tab_id,
              });

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
    case MODAL_TYPES.QUESTION_EMBED:
      return (
        <QuestionEmbedWidget card={question._card} onClose={onCloseModal} />
      );
  }
}
