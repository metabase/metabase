import {
  useUpdateCardEmbeddingParamsMutation,
  useUpdateCardEnableEmbeddingMutation,
} from "metabase/api";
import { STATIC_LEGACY_EMBEDDING_TYPE } from "metabase/embedding/constants";
import { useSelector } from "metabase/lib/redux";
import { EmbedModal } from "metabase/public/components/EmbedModal";
import { getMetadata } from "metabase/selectors/metadata";
import { getCardUiParameters } from "metabase-lib/v1/parameters/utils/cards";
import type { Card } from "metabase-types/api";

type QuestionEmbedWidgetProps = {
  card: Card;
  onBack?: () => void;
  onClose: () => void;
};
export const QuestionEmbedWidget = (props: QuestionEmbedWidgetProps) => {
  const { card, onBack, onClose } = props;

  const metadata = useSelector(getMetadata);

  const [updateEnableEmbedding] = useUpdateCardEnableEmbeddingMutation();
  const [updateEmbeddingParams] = useUpdateCardEmbeddingParamsMutation();

  return (
    <EmbedModal
      resource={card}
      resourceType="question"
      resourceParameters={getCardUiParameters(card, metadata)}
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
