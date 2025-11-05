import {
  useCreateCardPublicLinkMutation,
  useDeleteCardPublicLinkMutation,
  useUpdateCardEmbeddingParamsMutation,
  useUpdateCardEnableEmbeddingMutation,
} from "metabase/api";
import type { ExportFormatType } from "metabase/embedding/components/PublicLinkPopover/types";
import { STATIC_LEGACY_EMBEDDING_TYPE } from "metabase/embedding/constants";
import { useSelector } from "metabase/lib/redux";
import { publicQuestion } from "metabase/lib/urls";
import {
  EmbedModal,
  EmbedModalContent,
} from "metabase/public/components/EmbedModal";
import { getMetadata } from "metabase/selectors/metadata";
import { getCardUiParameters } from "metabase-lib/v1/parameters/utils/cards";
import type { Card } from "metabase-types/api";

type QuestionEmbedWidgetProps = {
  className?: string;
  card: Card;
  onClose: () => void;
};
export const QuestionEmbedWidget = (props: QuestionEmbedWidgetProps) => {
  const { className, card, onClose } = props;

  const metadata = useSelector(getMetadata);

  const [updateEnableEmbedding] = useUpdateCardEnableEmbeddingMutation();
  const [updateEmbeddingParams] = useUpdateCardEmbeddingParamsMutation();
  const [createPublicQuestionLink] = useCreateCardPublicLinkMutation();
  const [deletePublicQuestionLink] = useDeleteCardPublicLinkMutation();

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
          onUpdateEnableEmbedding={(enable_embedding) =>
            updateEnableEmbedding({
              id: card.id,
              enable_embedding,
              embedding_type: enable_embedding
                ? STATIC_LEGACY_EMBEDDING_TYPE
                : null,
            })
          }
          onUpdateEmbeddingParams={(embedding_params) =>
            updateEmbeddingParams({
              id: card.id,
              embedding_params,
              embedding_type: STATIC_LEGACY_EMBEDDING_TYPE,
            })
          }
          getPublicUrl={getPublicQuestionUrl}
          onClose={onClose}
        />
      )}
    </EmbedModal>
  );
};
