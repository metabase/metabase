import { useMemo } from "react";
import { push } from "react-router-redux";

import {
  useCreateCardMutation,
  useLazyGetCardQuery,
  useUpdateCardMutation,
} from "metabase/api";
import { archiveAndTrack } from "metabase/archive/analytics";
import { getTrashUndoMessage } from "metabase/archive/utils";
import { useGetDefaultCollectionId } from "metabase/collections/hooks";
import { ArchiveModal } from "metabase/common/components/ArchiveModal";
import Modal from "metabase/common/components/Modal";
import EntityCopyModal from "metabase/entities/containers/EntityCopyModal";
import { useDispatch } from "metabase/lib/redux";
import { MoveQuestionModal } from "metabase/query_builder/components/MoveQuestionModal";
import { getLabels } from "metabase/questions/containers/ArchiveQuestionModal";
import { addUndo } from "metabase/redux/undo";
import Question from "metabase-lib/v1/Question";
import type { SearchResult } from "metabase-types/api";

export interface SearchResultModal {
  type: "move" | "clone" | "archive";
  item: SearchResult;
}

interface SearchResultModalsProps {
  modal: SearchResultModal;
  onClose: () => void;
  activeId?: number;
}

const CloneQuestionModal = ({
  question,
  onClose,
}: {
  question: Question;
  onClose: () => void;
}) => {
  const dispatch = useDispatch();
  const [getCard] = useLazyGetCardQuery();
  const [createCard] = useCreateCardMutation();
  const initialCollectionId = useGetDefaultCollectionId();

  if (!question) {
    return null;
  }

  return (
    <EntityCopyModal
      entityType="questions"
      entityObject={{
        ...question.card(),
        collection_id: question.canWrite()
          ? question.collectionId()
          : initialCollectionId,
      }}
      copy={async (formValues) => {
        const { data: card } = await getCard({ id: question.id() });
        if (!card) {
          return;
        }
        const shouldBePinned = card.type === "model" || card.type === "metric";
        const res = await createCard({
          ...card,
          name: formValues.name,
          collection_id: formValues.collectionId,
          description: formValues.description,
          collection_position: shouldBePinned ? 1 : undefined,
        });
        const newId = res.data?.id;
        if (newId) {
          if (card.type === "model") {
            dispatch(push(`/bench/model/${newId}`));
          } else if (card.type === "metric") {
            dispatch(push(`/bench/metric/${newId}`));
          }
        }
      }}
      onClose={onClose}
      onSaved={onClose}
    />
  );
};

const ArchiveQuestionModal = ({
  question,
  onClose,
  activeId,
}: {
  question: Question;
  onClose: () => void;
  activeId?: number;
}) => {
  const dispatch = useDispatch();
  const [updateCard] = useUpdateCardMutation();
  const type = question.type();
  if (type !== "model" && type !== "metric") {
    return null;
  }
  const { title, message } = getLabels(question);

  return (
    <ArchiveModal
      title={title}
      model={type}
      modelId={question.id()}
      message={message}
      onArchive={async () => {
        await archiveAndTrack({
          archive: async () => {
            const res = await updateCard({ id: question.id(), archived: true });
            if (res.error) {
              return;
            }
            dispatch(
              addUndo({
                message: getTrashUndoMessage(question.card().name, true),
                action: () =>
                  updateCard({ id: question.id(), archived: false }),
              }),
            );
            if (activeId === question.id()) {
              if (question.type() === "model") {
                dispatch(push(`/bench/model`));
              } else if (question.type() === "metric") {
                dispatch(push(`/bench/metric`));
              }
            }
          },
          model: type,
          modelId: question.id(),
          triggeredFrom: "bench",
        });
      }}
      onClose={onClose}
    />
  );
};

export const SearchResultModals = ({
  modal,
  onClose,
  activeId,
}: SearchResultModalsProps) => {
  const { item } = modal;
  const question = useMemo(
    () =>
      new Question({
        ...item,
        type: item.model === "dataset" ? "model" : item.model,
      }),
    [item],
  );

  switch (modal.type) {
    case "move":
      return <MoveQuestionModal question={question} onClose={onClose} />;

    case "clone":
      return (
        <Modal onClose={onClose}>
          <CloneQuestionModal question={question} onClose={onClose} />
        </Modal>
      );

    case "archive": {
      return (
        <Modal onClose={onClose}>
          <ArchiveQuestionModal
            activeId={activeId}
            question={question}
            onClose={onClose}
          />
        </Modal>
      );
    }
  }
};
