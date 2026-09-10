import {
  useUpdateCardEmbeddingParamsMutation,
  useUpdateCardEnableEmbeddingMutation,
} from "metabase/api";
import { EmbedModal } from "metabase/embedding/components/EmbedModal";
import { STATIC_LEGACY_EMBEDDING_TYPE } from "metabase/embedding/constants";
import { useQuestionFromCard } from "metabase/metadata-store";
import type { Card } from "metabase-types/api";

type QuestionEmbedWidgetProps = {
  card: Card;
  onBack?: () => void;
  onClose: () => void;
};
export const QuestionEmbedWidget = (props: QuestionEmbedWidgetProps) => {
  const { card, onBack, onClose } = props;

  const buildQuestion = useQuestionFromCard();

  const [updateEnableEmbedding] = useUpdateCardEnableEmbeddingMutation();
  const [updateEmbeddingParams] = useUpdateCardEmbeddingParamsMutation();

  return (
    <EmbedModal
      opened={true}
      resource={card}
      resourceType="question"
      resourceParameters={buildQuestion(card).parameters()}
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
      onBack={onBack}
      onClose={onClose}
    />
  );
};
