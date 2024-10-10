import {
  useCreateCardPublicLinkMutation,
  useDeleteCardPublicLinkMutation,
} from "metabase/api";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { publicQuestion } from "metabase/lib/urls";
import {
  EmbedModal,
  EmbedModalContent,
} from "metabase/public/components/EmbedModal";
import type { EmbeddingParameters } from "metabase/public/lib/types";
import { getMetadata } from "metabase/selectors/metadata";
import type { ExportFormatType } from "metabase/sharing/components/PublicLinkPopover/types";
import { getCardUiParameters } from "metabase-lib/v1/parameters/utils/cards";
import type { Card } from "metabase-types/api";

import { updateEmbeddingParams, updateEnableEmbedding } from "../../actions";

type QuestionEmbedWidgetProps = {
  className?: string;
  card: Card;
  onClose: () => void;
};
export const QuestionEmbedWidget = (props: QuestionEmbedWidgetProps) => {
  const { className, card, onClose } = props;

  const metadata = useSelector(getMetadata);

  const dispatch = useDispatch();
  const [createPublicQuestionLink] = useCreateCardPublicLinkMutation();
  const [deletePublicQuestionLink] = useDeleteCardPublicLinkMutation();
  const updateQuestionEnableEmbedding = (enable_embedding: boolean) =>
    dispatch(
      updateEnableEmbedding({
        id: card.id,
        enable_embedding,
      }),
    );
  const updateQuestionEmbeddingParams = (
    embedding_params: EmbeddingParameters,
  ) =>
    dispatch(
      updateEmbeddingParams({
        id: card.id,
        embedding_params,
      }),
    );

  const getPublicQuestionUrl = (
    publicUuid: string,
    extension?: ExportFormatType,
  ) => publicQuestion({ uuid: publicUuid, type: extension });

  return (
    <EmbedModal onClose={onClose}>
      {({ embedType, goToNextStep }) => (
        <EmbedModalContent
          embedType={embedType}
          goToNextStep={goToNextStep}
          className={className}
          resource={card}
          resourceType="question"
          resourceParameters={getCardUiParameters(card, metadata)}
          onCreatePublicLink={() => createPublicQuestionLink({ id: card.id })}
          onDeletePublicLink={() => deletePublicQuestionLink({ id: card.id })}
          onUpdateEnableEmbedding={updateQuestionEnableEmbedding}
          onUpdateEmbeddingParams={updateQuestionEmbeddingParams}
          getPublicUrl={getPublicQuestionUrl}
        />
      )}
    </EmbedModal>
  );
};
