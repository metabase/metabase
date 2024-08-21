import { EmbedMenu } from "metabase/dashboard/components/EmbedMenu";
import {
  MODAL_TYPES,
  type QueryModalType,
} from "metabase/query_builder/constants";
import type Question from "metabase-lib/v1/Question";

import { ViewFooterSharingButton } from "../ViewFooterSharingButton";

export type QuestionEmbedActionProps = {
  question: Question;
  onOpenModal: (modalType: QueryModalType) => void;
};
export const QuestionEmbedAction = ({
  question,
  onOpenModal,
}: QuestionEmbedActionProps) => {
  const type = question.type();
  return (
    type === "question" &&
    !question.isArchived() &&
    (question.isSaved() ? (
      <EmbedMenu
        resource={question}
        resourceType="question"
        hasPublicLink={!!question.publicUUID()}
        onModalOpen={() => onOpenModal(MODAL_TYPES.EMBED)}
      />
    ) : (
      <ViewFooterSharingButton
        onClick={() => onOpenModal(MODAL_TYPES.SAVE_QUESTION_BEFORE_EMBED)}
      />
    ))
  );
};
