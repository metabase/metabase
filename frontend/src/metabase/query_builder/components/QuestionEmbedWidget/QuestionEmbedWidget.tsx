import type { Card } from "metabase-types/api";
import type { EmbedOptions } from "metabase-types/store";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { EmbedModal } from "metabase/public/components/widgets/EmbedModal";
import EmbedModalContent from "metabase/public/components/widgets/EmbedModalContent";
import { getMetadata } from "metabase/selectors/metadata";
import { getCardUiParameters } from "metabase-lib/parameters/utils/cards";

import {
  createPublicLink,
  deletePublicLink,
  updateEnableEmbedding,
  updateEmbeddingParams,
} from "../../actions";

type QuestionEmbedWidgetProps = {
  className?: string;
  card: Card;
  onClose: () => void;
};
export const QuestionEmbedWidget = (props: QuestionEmbedWidgetProps) => {
  const { className, card, onClose } = props;

  const metadata = useSelector(getMetadata);

  const dispatch = useDispatch();
  const createPublicQuestionLink = () => dispatch(createPublicLink(card));
  const deletePublicQuestionLink = () => dispatch(deletePublicLink(card));
  const updateQuestionEnableEmbedding = (enableEmbedding: boolean) =>
    dispatch(updateEnableEmbedding(card, enableEmbedding));
  const updateQuestionEmbeddingParams = (embeddingParams: EmbedOptions) =>
    dispatch(updateEmbeddingParams(card, embeddingParams));

  return (
    <EmbedModal onClose={onClose}>
      {({ embedType, setEmbedType }) => (
        <EmbedModalContent
          {...props}
          embedType={embedType}
          setEmbedType={setEmbedType}
          className={className}
          resource={card}
          resourceType="question"
          resourceParameters={getCardUiParameters(card, metadata)}
          onCreatePublicLink={createPublicQuestionLink}
          onDeletePublicLink={deletePublicQuestionLink}
          onUpdateEnableEmbedding={updateQuestionEnableEmbedding}
          onUpdateEmbeddingParams={updateQuestionEmbeddingParams}
        />
      )}
    </EmbedModal>
  );
};
