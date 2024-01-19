import { t } from "ttag";
import _ from "underscore";
import { useState } from "react";
import { Stack, Tabs } from "metabase/ui";
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
import { getSignedPreviewUrl } from "metabase/public/lib/embed";
import { getEmbedServerCodeExampleOptions } from "metabase/public/lib/code";

import { DEFAULT_DISPLAY_OPTIONS } from "./config";
import { ServerEmbedCodePane } from "./ServerEmbedCodePane";
import { EmbedModalContentStatusBar } from "./EmbedModalContentStatusBar";
import { ParametersSettings } from "./ParametersSettings";
import { AppearanceSettings } from "./AppearanceSettings";
import { OverviewSettings } from "./OverviewSettings";
import type { ActivePreviewPane } from "./types";

const TABS = {
  Overview: "overview",
  Parameters: "parameters",
  Appearance: "appearance",
};

export interface StaticEmbedSetupPaneProps {
  resource: EmbedResource;
  resourceType: EmbedResourceType;
  resourceParameters: EmbedResourceParameter[];

  onUpdateEnableEmbedding: (enableEmbedding: boolean) => void | Promise<void>;
  onUpdateEmbeddingParams: (
    embeddingParams: EmbeddingParameters,
  ) => void | Promise<void>;
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

  const serverCodeOptions = getEmbedServerCodeExampleOptions({
    siteUrl,
    secretKey,
    resourceType,
    resourceId: resource.id,
    params: previewParametersBySlug,
    displayOptions,
  });

  const [selectedServerCodeOptionName, setSelectedServerCodeOptionName] =
    useState(serverCodeOptions[0].name);

  const selectedServerCodeOption = serverCodeOptions.find(
    ({ name }) => name === selectedServerCodeOptionName,
  );

  const hasSettingsChanges = getHasSettingsChanges({
    initialEmbeddingParams,
    embeddingParams,
  });

  const iframeUrl = getSignedPreviewUrl(
    siteUrl,
    resourceType,
    resource.id,
    previewParametersBySlug,
    displayOptions,
    secretKey,
    embeddingParams,
  );

  const handleSave = async () => {
    try {
      if (!resource.enable_embedding) {
        await onUpdateEnableEmbedding(true);
      }
      await onUpdateEmbeddingParams(embeddingParams);
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

  return (
    <Stack spacing={0}>
      <EmbedModalContentStatusBar
        resourceType={resourceType}
        isPublished={resource.enable_embedding}
        hasSettingsChanges={hasSettingsChanges}
        onSave={handleSave}
        onUnpublish={handleUnpublish}
        onDiscard={handleDiscard}
      />

      <Tabs defaultValue={TABS.Overview} data-testid="embedding-preview">
        <Tabs.List p="0 1.5rem">
          <Tabs.Tab value={TABS.Overview}>{t`Overview`}</Tabs.Tab>
          {resourceType !== "question" && (
            <Tabs.Tab value={TABS.Parameters}>{t`Parameters`}</Tabs.Tab>
          )}
          <Tabs.Tab value={TABS.Appearance}>{t`Appearance`}</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value={TABS.Overview}>
          <OverviewSettings
            resourceType={resourceType}
            selectedServerCodeOption={selectedServerCodeOption}
            serverEmbedCodeSlot={
              <ServerEmbedCodePane
                className="flex-full w-full"
                variant="overview"
                initialPreviewParameters={initialPreviewParameters}
                resource={resource}
                resourceType={resourceType}
                siteUrl={siteUrl}
                secretKey={secretKey}
                params={previewParametersBySlug}
                displayOptions={displayOptions}
                serverCodeOptions={serverCodeOptions}
                selectedServerCodeOptionName={selectedServerCodeOptionName}
                setSelectedServerCodeOptionName={
                  setSelectedServerCodeOptionName
                }
              />
            }
          />
        </Tabs.Panel>
        <Tabs.Panel value={TABS.Parameters}>
          <ParametersSettings
            activePane={activePane}
            resourceType={resourceType}
            resourceParameters={resourceParameters}
            embeddingParams={embeddingParams}
            lockedParameters={lockedParameters}
            parameterValues={parameterValues}
            iframeUrl={iframeUrl}
            displayOptions={displayOptions}
            serverEmbedCodeSlot={
              <ServerEmbedCodePane
                className="flex-full w-full"
                variant="parameters"
                initialPreviewParameters={initialPreviewParameters}
                resource={resource}
                resourceType={resourceType}
                siteUrl={siteUrl}
                secretKey={secretKey}
                params={previewParametersBySlug}
                displayOptions={displayOptions}
                serverCodeOptions={serverCodeOptions}
                selectedServerCodeOptionName={selectedServerCodeOptionName}
                setSelectedServerCodeOptionName={
                  setSelectedServerCodeOptionName
                }
              />
            }
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
            resourceType={resourceType}
            iframeUrl={iframeUrl}
            displayOptions={displayOptions}
            serverEmbedCodeSlot={
              <ServerEmbedCodePane
                className="flex-full w-full"
                variant="appearance"
                initialPreviewParameters={initialPreviewParameters}
                resource={resource}
                resourceType={resourceType}
                siteUrl={siteUrl}
                secretKey={secretKey}
                params={previewParametersBySlug}
                displayOptions={displayOptions}
                serverCodeOptions={serverCodeOptions}
                selectedServerCodeOptionName={selectedServerCodeOptionName}
                setSelectedServerCodeOptionName={
                  setSelectedServerCodeOptionName
                }
              />
            }
            onChangePane={setActivePane}
            onChangeDisplayOptions={setDisplayOptions}
          />
        </Tabs.Panel>
      </Tabs>
    </Stack>
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

function getPreviewParamsBySlug({
  resourceParameters,
  embeddingParams,
  parameterValues,
}: {
  resourceParameters: EmbedResourceParameter[];
  embeddingParams: EmbeddingParameters;
  parameterValues: EmbeddingParametersValues;
}) {
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
}

function getLockedPreviewParameters(
  resourceParameters: EmbedResourceParameter[],
  embeddingParams: EmbeddingParameters,
) {
  return resourceParameters.filter(
    parameter => embeddingParams[parameter.slug] === "locked",
  );
}

function getHasSettingsChanges({
  initialEmbeddingParams,
  embeddingParams,
}: {
  initialEmbeddingParams: EmbeddingParameters;
  embeddingParams: EmbeddingParameters;
}): boolean {
  const nonDisabledInitialEmbeddingParams = getNonDisabledEmbeddingParams(
    initialEmbeddingParams,
  );
  const nonDisabledEmbeddingParams =
    getNonDisabledEmbeddingParams(embeddingParams);

  return !_.isEqual(
    nonDisabledInitialEmbeddingParams,
    nonDisabledEmbeddingParams,
  );
}

function getNonDisabledEmbeddingParams(
  embeddingParams: EmbeddingParameters,
): EmbeddingParameters {
  return Object.keys(embeddingParams).reduce((result, key) => {
    if (embeddingParams[key] !== "disabled") {
      result[key] = embeddingParams[key];
    }

    return result;
  }, {} as EmbeddingParameters);
}
