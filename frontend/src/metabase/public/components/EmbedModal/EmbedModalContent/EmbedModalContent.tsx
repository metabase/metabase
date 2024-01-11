import type { ExportFormatType } from "metabase/dashboard/components/PublicLinkPopover/types";
import type {
  EmbeddingParameters,
  EmbedResource,
  EmbedResourceParameter,
  EmbedResourceType,
  EmbedType,
} from "metabase/public/lib/types";
import { StaticEmbedSetupPane } from "../StaticEmbedSetupPane";
import { SelectEmbedTypePane } from "../SelectEmbedTypePane";

export interface EmbedModalContentProps {
  embedType: EmbedType;
  setEmbedType: (type: EmbedType) => void;

  resource: EmbedResource;
  resourceType: EmbedResourceType;
  resourceParameters: EmbedResourceParameter[];

  onUpdateEnableEmbedding: (enableEmbedding: boolean) => void;
  onUpdateEmbeddingParams: (embeddingParams: EmbeddingParameters) => void;

  onCreatePublicLink: () => void;
  onDeletePublicLink: () => void;
  getPublicUrl: (publicUuid: string, extension?: ExportFormatType) => string;

  className?: string;
}

export const EmbedModalContent = ({
  embedType,
  setEmbedType,
  resource,
  resourceType,
  resourceParameters,
  onUpdateEnableEmbedding,
  onUpdateEmbeddingParams,
  onCreatePublicLink,
  onDeletePublicLink,
  getPublicUrl,
}: EmbedModalContentProps): JSX.Element => {
  if (!embedType) {
    return (
      <SelectEmbedTypePane
        resource={resource}
        resourceType={resourceType}
        onCreatePublicLink={onCreatePublicLink}
        onDeletePublicLink={onDeletePublicLink}
        getPublicUrl={getPublicUrl}
        onChangeEmbedType={setEmbedType}
      />
    );
  }

  return (
    <StaticEmbedSetupPane
      resource={resource}
      resourceType={resourceType}
      resourceParameters={resourceParameters}
      onUpdateEmbeddingParams={onUpdateEmbeddingParams}
      onUpdateEnableEmbedding={onUpdateEnableEmbedding}
    />
  );
};
