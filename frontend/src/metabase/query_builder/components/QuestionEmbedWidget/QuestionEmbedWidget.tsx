import type { Card } from "metabase-types/api";
import type { EmbedOptions } from "metabase-types/store";
import type { ExportFormatType } from "metabase/dashboard/components/PublicLinkPopover/PublicLinkCopyPanel";
import { useDispatch, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
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
  className: string;
  card: Card;
  onClose: () => void;
};
export const QuestionEmbedWidget = (props: QuestionEmbedWidgetProps) => {
  const { className, card, onClose } = props;

  const metadata = useSelector(getMetadata);

  const dispatch = useDispatch();
  const createPublicQuestionLink = () => dispatch(createPublicLink(card));
  const disablePublicQuestionLink = () => dispatch(deletePublicLink(card));
  const updateQuestionEnableEmbedding = (enableEmbedding: boolean) =>
    dispatch(updateEnableEmbedding(card, enableEmbedding));
  const updateQuestionEmbeddingParams = (embeddingParams: EmbedOptions) =>
    dispatch(updateEmbeddingParams(card, embeddingParams));

  const getPublicUrl = (
    {
      public_uuid,
    }: {
      public_uuid: string;
    },
    extension: ExportFormatType,
  ) => Urls.publicQuestion({ uuid: public_uuid, type: extension });

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
          onDisablePublicLink={disablePublicQuestionLink}
          onUpdateEnableEmbedding={updateQuestionEnableEmbedding}
          onUpdateEmbeddingParams={updateQuestionEmbeddingParams}
          getPublicUrl={getPublicUrl}
          extensions={Urls.exportFormats}
        />
      )}
    </EmbedModal>
  );
};
