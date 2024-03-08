import type { ExportFormatType } from "metabase/dashboard/components/PublicLinkPopover/types";
import { LegaleseStep } from "metabase/public/components/widgets/LegaleseStep/LegaleseStep";
import type {
  EmbeddingParameters,
  EmbedResource,
  EmbedResourceParameter,
  EmbedResourceType,
  EmbedModalStep,
} from "metabase/public/lib/types";

import { SelectEmbedTypePane } from "../SelectEmbedTypePane";
import { StaticEmbedSetupPane } from "../StaticEmbedSetupPane";

export interface EmbedModalContentProps {
  embedType: EmbedModalStep;
  goToNextStep: () => void;

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

export const EmbedModalContent = (
  props: EmbedModalContentProps,
): JSX.Element => {
  const {
    embedType,
    goToNextStep,
    resource,
    resourceType,
    resourceParameters,
    onUpdateEnableEmbedding,
    onUpdateEmbeddingParams,
    onCreatePublicLink,
    onDeletePublicLink,
    getPublicUrl,
  } = props;

  if (embedType == null) {
    return (
      <SelectEmbedTypePane
        resource={resource}
        resourceType={resourceType}
        onCreatePublicLink={onCreatePublicLink}
        onDeletePublicLink={onDeletePublicLink}
        getPublicUrl={getPublicUrl}
        goToNextStep={goToNextStep}
      />
    );
  }

  if (embedType === "legalese") {
    return <LegaleseStep goToNextStep={goToNextStep} />;
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
