import { useState } from "react";
import _ from "underscore";
import { LegaleseStep } from "metabase/public/components/widgets/LegaleseStep/LegaleseStep";
import { getSignedPreviewUrl, getSignedToken } from "metabase/public/lib/embed";
import { getSetting } from "metabase/selectors/settings";
import { useSelector } from "metabase/lib/redux";
import type { ExportFormatType } from "metabase/dashboard/components/PublicLinkPopover/types";

import { checkNotNull } from "metabase/lib/types";
import { StaticEmbedSetupPane } from "../StaticEmbedSetupPane";
import type {
  ActivePreviewPane,
  EmbeddingDisplayOptions,
  EmbeddingParameters,
  EmbeddingParametersValues,
  EmbedResource,
  EmbedResourceParameter,
  EmbedResourceType,
  EmbedModalStep,
} from "../types";
import { SelectEmbedTypePane } from "../SelectEmbedTypePane";
import { EmbedModalContentStatusBar } from "./EmbedModalContentStatusBar";

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

  const [pane, setPane] = useState<ActivePreviewPane>("code");

  const siteUrl = useSelector(state => getSetting(state, "site-url"));
  const secretKey = checkNotNull(
    useSelector(state => getSetting(state, "embedding-secret-key")),
  );
  const [embeddingParams, setEmbeddingParams] = useState<EmbeddingParameters>(
    getDefaultEmbeddingParams(resource, resourceParameters),
  );
  const [parameterValues, setParameterValues] =
    useState<EmbeddingParametersValues>({});
  const [displayOptions, setDisplayOptions] = useState<EmbeddingDisplayOptions>(
    {
      font: null,
      theme: null,
      bordered: true,
      titled: true,
    },
  );

  const handleSave = async () => {
    try {
      if (embedType === "application") {
        if (!resource.enable_embedding) {
          await onUpdateEnableEmbedding(true);
        }
        await onUpdateEmbeddingParams(embeddingParams);
      } else {
        if (!resource.public_uuid) {
          await onCreatePublicLink();
        }
      }
    } catch (e) {
      console.error(e);
      throw e;
    }
  };

  const handleUnpublish = async () => {
    try {
      await onUpdateEnableEmbedding(false);
    } catch (e) {
      console.error(e);
      throw e;
    }
  };

  const handleDiscard = () => {
    setEmbeddingParams(getDefaultEmbeddingParams(resource, resourceParameters));
  };

  const getPreviewParamsBySlug = () => {
    const lockedParameters = getLockedPreviewParameters(
      resourceParameters,
      embeddingParams,
    );

    return Object.fromEntries(
      lockedParameters.map(parameter => [
        parameter.slug,
        parameterValues[parameter.id] ?? null,
      ]),
    );
  };

  const previewParametersBySlug = getPreviewParamsBySlug();
  const lockedParameters = getLockedPreviewParameters(
    resourceParameters,
    embeddingParams,
  );

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

  const hasSettingsChanges = !_.isEqual(
    resource.embedding_params,
    embeddingParams,
  );

  return (
    <div className="flex flex-column full-height">
      <EmbedModalContentStatusBar
        resourceType={resourceType}
        isPublished={resource.enable_embedding}
        hasSettingsChanges={hasSettingsChanges}
        onSave={handleSave}
        onUnpublish={handleUnpublish}
        onDiscard={handleDiscard}
      />

      <div className="flex flex-full">
        <StaticEmbedSetupPane
          activePane={pane}
          resource={resource}
          resourceType={resourceType}
          embedType={embedType}
          token={getSignedToken(
            resourceType,
            resource.id,
            previewParametersBySlug,
            secretKey,
            embeddingParams,
          )}
          iframeUrl={getSignedPreviewUrl(
            siteUrl,
            resourceType,
            resource.id,
            previewParametersBySlug,
            displayOptions,
            secretKey,
            embeddingParams,
          )}
          siteUrl={siteUrl}
          secretKey={secretKey}
          params={previewParametersBySlug}
          displayOptions={displayOptions}
          lockedParameters={lockedParameters}
          parameterValues={parameterValues}
          resourceParameters={resourceParameters}
          embeddingParams={embeddingParams}
          onChangeDisplayOptions={setDisplayOptions}
          onChangeEmbeddingParameters={setEmbeddingParams}
          onChangeParameterValue={(id: string, value: string) =>
            setParameterValues(state => ({
              ...state,
              [id]: value,
            }))
          }
          onChangePane={setPane}
        />
      </div>
    </div>
  );
};

function getDefaultEmbeddingParams(
  resource: EmbedResource,
  resourceParameters: EmbedResourceParameter[],
) {
  return filterValidResourceParameters(
    resourceParameters,
    resource.embedding_params || {},
  );
}

function filterValidResourceParameters(
  resourceParameters: EmbedResourceParameter[],
  embeddingParams: EmbeddingParameters,
) {
  const validParameters = resourceParameters.map(parameter => parameter.slug);

  return _.pick(embeddingParams, validParameters);
}

function getLockedPreviewParameters(
  resourceParameters: EmbedResourceParameter[],
  embeddingParams: EmbeddingParameters,
) {
  return resourceParameters.filter(
    parameter => embeddingParams[parameter.slug] === "locked",
  );
}
