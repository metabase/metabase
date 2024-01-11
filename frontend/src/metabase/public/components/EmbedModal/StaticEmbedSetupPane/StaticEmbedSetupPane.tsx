import { t } from "ttag";
import _ from "underscore";
import { useState } from "react";
import { Tabs } from "metabase/ui";
import type { ActivePreviewPane } from "metabase/public/components/EmbedModal";
import { useSelector } from "metabase/lib/redux";
import { getSetting } from "metabase/selectors/settings";
import { checkNotNull } from "metabase/lib/types";
import type {
  EmbeddingDisplayOptions,
  EmbeddingParameters,
  EmbeddingParametersValues,
  EmbedResource,
  EmbedResourceParameter,
  EmbedResourceType,
} from "metabase/public/lib/types";
import { DEFAULT_DISPLAY_OPTIONS } from "metabase/public/components/EmbedModal/StaticEmbedSetupPane/config";
import { getSignedPreviewUrl } from "metabase/public/lib/embed";

import { EmbedModalContentStatusBar } from "./EmbedModalContentStatusBar";
import { ParametersSettings } from "./ParametersSettings";
import { AppearanceSettings } from "./AppearanceSettings";
import { OverviewSettings } from "./OverviewSettings";

const TABS = {
  Overview: "overview",
  Parameters: "parameters",
  Appearance: "appearance",
};

export interface StaticEmbedSetupPaneProps {
  resource: EmbedResource;
  resourceType: EmbedResourceType;
  resourceParameters: EmbedResourceParameter[];

  onUpdateEnableEmbedding: (enableEmbedding: boolean) => void;
  onUpdateEmbeddingParams: (embeddingParams: EmbeddingParameters) => void;
}

export const StaticEmbedSetupPane = ({
  resource,
  resourceType,
  resourceParameters,
  onUpdateEnableEmbedding,
  onUpdateEmbeddingParams,
}: StaticEmbedSetupPaneProps): JSX.Element => {
  const [activePane, setActivePane] = useState<ActivePreviewPane>("code");

  const siteUrl = useSelector(state => getSetting(state, "site-url"));
  const secretKey = checkNotNull(
    useSelector(state => getSetting(state, "embedding-secret-key")),
  );
  const initialEmbeddingParams = getDefaultEmbeddingParams(
    resource,
    resourceParameters,
  );
  const [embeddingParams, setEmbeddingParams] = useState<EmbeddingParameters>(
    initialEmbeddingParams,
  );
  const [parameterValues, setParameterValues] =
    useState<EmbeddingParametersValues>({});
  const [displayOptions, setDisplayOptions] = useState<EmbeddingDisplayOptions>(
    DEFAULT_DISPLAY_OPTIONS,
  );

  const previewParametersBySlug = getPreviewParamsBySlug({
    resourceParameters,
    embeddingParams,
    parameterValues,
  });
  const initialPreviewParameters = getPreviewParamsBySlug({
    resourceParameters,
    embeddingParams: initialEmbeddingParams,
    parameterValues,
  });
  const lockedParameters = getLockedPreviewParameters(
    resourceParameters,
    embeddingParams,
  );

  const hasSettingsChanges = !_.isEqual(
    initialEmbeddingParams,
    embeddingParams,
  );

  const iframeUrl = getSignedPreviewUrl(
    siteUrl,
    resourceType,
    resource.id,
    previewParametersBySlug,
    displayOptions,
    secretKey,
    embeddingParams,
  );

  const handleSave = () => {
    try {
      if (!resource.enable_embedding) {
        onUpdateEnableEmbedding(true);
      }
      onUpdateEmbeddingParams(embeddingParams);
    } catch (e) {
      console.error(e);
      throw e;
    }
  };

  const handleUnpublish = () => {
    try {
      onUpdateEnableEmbedding(false);
    } catch (e) {
      console.error(e);
      throw e;
    }
  };

  const handleDiscard = () => {
    setEmbeddingParams(getDefaultEmbeddingParams(resource, resourceParameters));
  };

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
        <Tabs defaultValue={TABS.Overview} data-testid="embedding-preview">
          <Tabs.List p="0 1.5rem">
            <Tabs.Tab value={TABS.Overview}>{t`Overview`}</Tabs.Tab>
            <Tabs.Tab value={TABS.Parameters}>{t`Parameters`}</Tabs.Tab>
            <Tabs.Tab value={TABS.Appearance}>{t`Appearance`}</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value={TABS.Overview}>
            <OverviewSettings
              resource={resource}
              resourceType={resourceType}
              siteUrl={siteUrl}
              secretKey={secretKey}
              params={previewParametersBySlug}
              displayOptions={displayOptions}
            />
          </Tabs.Panel>
          <Tabs.Panel value={TABS.Parameters}>
            <ParametersSettings
              activePane={activePane}
              resource={resource}
              resourceType={resourceType}
              resourceParameters={resourceParameters}
              embeddingParams={embeddingParams}
              lockedParameters={lockedParameters}
              parameterValues={parameterValues}
              iframeUrl={iframeUrl}
              siteUrl={siteUrl}
              secretKey={secretKey}
              params={previewParametersBySlug}
              initialPreviewParameters={initialPreviewParameters}
              displayOptions={displayOptions}
              onChangeEmbeddingParameters={setEmbeddingParams}
              onChangeParameterValue={(id: string, value: string) =>
                setParameterValues(state => ({
                  ...state,
                  [id]: value,
                }))
              }
              onChangePane={setActivePane}
            />
          </Tabs.Panel>
          <Tabs.Panel value={TABS.Appearance}>
            <AppearanceSettings
              activePane={activePane}
              resource={resource}
              resourceType={resourceType}
              iframeUrl={iframeUrl}
              siteUrl={siteUrl}
              secretKey={secretKey}
              params={previewParametersBySlug}
              initialPreviewParameters={initialPreviewParameters}
              displayOptions={displayOptions}
              onChangePane={setActivePane}
              onChangeDisplayOptions={setDisplayOptions}
            />
          </Tabs.Panel>
        </Tabs>
      </div>
    </div>
  );
};

function getDefaultEmbeddingParams(
  resource: EmbedResource,
  resourceParameters: EmbedResourceParameter[],
): EmbeddingParameters {
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

const getPreviewParamsBySlug = ({
  resourceParameters,
  embeddingParams,
  parameterValues,
}: {
  resourceParameters: EmbedResourceParameter[];
  embeddingParams: EmbeddingParameters;
  parameterValues: EmbeddingParametersValues;
}) => {
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

function getLockedPreviewParameters(
  resourceParameters: EmbedResourceParameter[],
  embeddingParams: EmbeddingParameters,
) {
  return resourceParameters.filter(
    parameter => embeddingParams[parameter.slug] === "locked",
  );
}
