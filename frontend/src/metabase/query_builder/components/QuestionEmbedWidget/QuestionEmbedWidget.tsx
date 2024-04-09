import type { ExportFormatType } from "metabase/dashboard/components/PublicLinkPopover/types";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { publicQuestion } from "metabase/lib/urls";
import {
  EmbedModal,
  EmbedModalContent,
} from "metabase/public/components/EmbedModal";
import { getMetadata } from "metabase/selectors/metadata";
import { getCardUiParameters } from "metabase-lib/v1/parameters/utils/cards";
import type { Card } from "metabase-types/api";
import type { EmbedOptions } from "metabase-types/store";

import {
  createPublicLink,
  deletePublicLink,
  updateEmbeddingParams,
  updateEnableEmbedding,
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
          onCreatePublicLink={createPublicQuestionLink}
          onDeletePublicLink={deletePublicQuestionLink}
          onUpdateEnableEmbedding={updateQuestionEnableEmbedding}
          onUpdateEmbeddingParams={updateQuestionEmbeddingParams}
          getPublicUrl={getPublicQuestionUrl}
        />
      )}
    </EmbedModal>
  );
};
