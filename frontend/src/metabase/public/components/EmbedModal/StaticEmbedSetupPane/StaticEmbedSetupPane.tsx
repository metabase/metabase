import cx from "classnames";
import { useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import { useSetting } from "metabase/common/hooks";
import CS from "metabase/css/core/index.css";
import { useSelector } from "metabase/lib/redux";
import { checkNotNull } from "metabase/lib/types";
import {
  trackStaticEmbedCodeCopied,
  trackStaticEmbedDiscarded,
  trackStaticEmbedPublished,
  trackStaticEmbedUnpublished,
} from "metabase/public/lib/analytics";
import { getEmbedServerCodeExampleOptions } from "metabase/public/lib/code";
import {
  getSignedPreviewUrlWithoutHash,
  optionsToHashParams,
} from "metabase/public/lib/embed";
import type {
  EmbeddingDisplayOptions,
  EmbeddingParameters,
  EmbeddingParametersValues,
  EmbeddingParameterVisibility,
  EmbedResource,
  EmbedResourceParameter,
  EmbedResourceType,
} from "metabase/public/lib/types";
import { getCanWhitelabel } from "metabase/selectors/whitelabel";
import { Stack, Tabs } from "metabase/ui";
import { getParameterValue } from "metabase-lib/v1/parameters/utils/parameter-values";

import { AppearanceSettings } from "./AppearanceSettings";
import { EmbedModalContentStatusBar } from "./EmbedModalContentStatusBar";
import { OverviewSettings } from "./OverviewSettings";
import { ParametersSettings } from "./ParametersSettings";
import { PreviewModeSelector } from "./PreviewModeSelector";
import { PreviewPane } from "./PreviewPane";
import { ServerEmbedCodePane } from "./ServerEmbedCodePane";
import { SettingsTabLayout } from "./StaticEmbedSetupPane.styled";
import { getDefaultDisplayOptions } from "./config";
import { EMBED_MODAL_TABS } from "./tabs";
import type { ActivePreviewPane, EmbedCodePaneVariant } from "./types";

const countEmbeddingParameterOptions = (embeddingParams: EmbeddingParameters) =>
  Object.values(embeddingParams).reduce(
    (acc, value) => {
      acc[value] += 1;
      return acc;
    },
    { disabled: 0, locked: 0, enabled: 0 } as Record<
      EmbeddingParameterVisibility,
      number
    >,
  );

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

  const siteUrl = useSetting("site-url");
  const secretKey = checkNotNull(useSetting("embedding-secret-key"));
  const exampleDashboardId = useSetting("example-dashboard-id");
  const initialEmbeddingParams = getDefaultEmbeddingParams(
    resource,
    resourceParameters,
  );
  const [embeddingParams, setEmbeddingParams] = useState<EmbeddingParameters>(
    initialEmbeddingParams,
  );
  const [parameterValues, setParameterValues] =
    useState<EmbeddingParametersValues>({});

  const canWhitelabel = useSelector(getCanWhitelabel);
  const shouldShowDownloadData = canWhitelabel && resourceType === "question";
  const [displayOptions, setDisplayOptions] = useState<EmbeddingDisplayOptions>(
    getDefaultDisplayOptions(shouldShowDownloadData),
  );

  const previewParametersBySlug = useMemo(
    () =>
      getPreviewParamsBySlug({
        resourceParameters,
        embeddingParams,
        parameterValues,
      }),
    [embeddingParams, parameterValues, resourceParameters],
  );
  const initialPreviewParameters = getPreviewParamsBySlug({
    resourceParameters,
    embeddingParams: initialEmbeddingParams,
    parameterValues: {},
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

  const [selectedServerCodeOptionId, setSelectedServerCodeOptionId] = useState(
    serverCodeOptions[0].id,
  );

  const selectedServerCodeOption = serverCodeOptions.find(
    ({ id }) => id === selectedServerCodeOptionId,
  );

  const hasSettingsChanges = getHasSettingsChanges({
    initialEmbeddingParams,
    embeddingParams,
  });

  const iframeUrlWithoutHash = useMemo(
    () =>
      getSignedPreviewUrlWithoutHash(
        siteUrl,
        resourceType,
        resource.id,
        previewParametersBySlug,
        secretKey,
        embeddingParams,
      ),
    [
      embeddingParams,
      previewParametersBySlug,
      resource.id,
      resourceType,
      secretKey,
      siteUrl,
    ],
  );

  const iframeUrl = iframeUrlWithoutHash + optionsToHashParams(displayOptions);

  const handleSave = async () => {
    if (!resource.enable_embedding) {
      await onUpdateEnableEmbedding(true);
    }
    await onUpdateEmbeddingParams(embeddingParams);
    trackStaticEmbedPublished({
      artifact: resourceType,
      resource,
      isExampleDashboard: exampleDashboardId === resource.id,
      params: countEmbeddingParameterOptions({
        ...convertResourceParametersToEmbeddingParams(resourceParameters),
        ...embeddingParams,
      }),
    });
  };

  const handleUnpublish = async () => {
    await onUpdateEnableEmbedding(false);
    trackStaticEmbedUnpublished({
      artifact: resourceType,
      resource,
    });
  };

  const handleDiscard = () => {
    setEmbeddingParams(getDefaultEmbeddingParams(resource, resourceParameters));
    trackStaticEmbedDiscarded({
      artifact: resourceType,
    });
  };

  const getServerEmbedCodePane = (variant: EmbedCodePaneVariant) => {
    return (
      <ServerEmbedCodePane
        className={cx(CS.flexFull, CS.wFull)}
        variant={variant}
        initialPreviewParameters={initialPreviewParameters}
        resource={resource}
        resourceType={resourceType}
        siteUrl={siteUrl}
        secretKey={secretKey}
        params={previewParametersBySlug}
        displayOptions={displayOptions}
        serverCodeOptions={serverCodeOptions}
        selectedServerCodeOptionId={selectedServerCodeOptionId}
        setSelectedServerCodeOptionId={setSelectedServerCodeOptionId}
        onCopy={() =>
          handleCodeCopy({
            code: "backend",
            variant,
            language: selectedServerCodeOptionId,
          })
        }
      />
    );
  };

  const handleCodeCopy = ({
    code,
    variant,
    language,
  }: {
    code: "backend" | "view";
    variant: EmbedCodePaneVariant;
    language: string;
  }) => {
    const locationMap = {
      overview: "code_overview",
      parameters: "code_params",
      appearance: "code_appearance",
    } as const;
    trackStaticEmbedCodeCopied({
      artifact: resourceType,
      location: locationMap[variant],
      code,
      language,
      displayOptions,
    });
  };

  const [activeTab, setActiveTab] = useState<
    typeof EMBED_MODAL_TABS[keyof typeof EMBED_MODAL_TABS]
  >(EMBED_MODAL_TABS.Overview);
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

      <Tabs
        defaultValue={EMBED_MODAL_TABS.Overview}
        data-testid="embedding-preview"
      >
        <Tabs.List p="0 1.5rem">
          <Tabs.Tab
            value={EMBED_MODAL_TABS.Overview}
            onClick={() => setActiveTab(EMBED_MODAL_TABS.Overview)}
          >{t`Overview`}</Tabs.Tab>
          <Tabs.Tab
            value={EMBED_MODAL_TABS.Parameters}
            onClick={() => setActiveTab(EMBED_MODAL_TABS.Parameters)}
          >{t`Parameters`}</Tabs.Tab>
          <Tabs.Tab
            value={EMBED_MODAL_TABS.Appearance}
            onClick={() => setActiveTab(EMBED_MODAL_TABS.Appearance)}
          >{t`Appearance`}</Tabs.Tab>
        </Tabs.List>
        {/**
         * Please do not add more than one `Tabs.Panel` here.
         *
         * The reason there is only one `Tabs.Panel` is because I don't want
         * the iframe (rendered inside `PreviewPane`) to be re-mounted when
         * changing tabs. Otherwise, the preview will be reloaded
         * every time we change tabs which makes it hard for users to see
         * the preview while editing settings.
         *
         * This is because React will unmount everything
         * when you change to a different tab since they're all rendered inside
         * different `Tabs.Panel` if you were to use it as Mantine suggests.
         */}
        <Tabs.Panel value={activeTab}>
          {activeTab === EMBED_MODAL_TABS.Overview ? (
            <OverviewSettings
              resourceType={resourceType}
              selectedServerCodeOption={selectedServerCodeOption}
              serverEmbedCodeSlot={getServerEmbedCodePane(
                EMBED_MODAL_TABS.Overview,
              )}
              onClientCodeCopy={language =>
                handleCodeCopy({ code: "view", variant: "overview", language })
              }
            />
          ) : activeTab === EMBED_MODAL_TABS.Parameters ? (
            <SettingsTabLayout
              settingsSlot={
                <ParametersSettings
                  resourceType={resourceType}
                  resourceParameters={resourceParameters}
                  embeddingParams={embeddingParams}
                  lockedParameters={lockedParameters}
                  parameterValues={parameterValues}
                  onChangeEmbeddingParameters={setEmbeddingParams}
                  onChangeParameterValue={(id: string, value: string) =>
                    setParameterValues(state => ({
                      ...state,
                      [id]: value,
                    }))
                  }
                />
              }
              previewSlot={
                <>
                  <PreviewModeSelector
                    value={activePane}
                    onChange={setActivePane}
                  />
                  <PreviewPane
                    hidden={activePane !== "preview"}
                    className={CS.flexFull}
                    previewUrl={iframeUrl}
                    isTransparent={displayOptions.theme === "transparent"}
                  />
                  {activePane === "code"
                    ? getServerEmbedCodePane(EMBED_MODAL_TABS.Parameters)
                    : null}
                </>
              }
            />
          ) : activeTab === EMBED_MODAL_TABS.Appearance ? (
            <SettingsTabLayout
              settingsSlot={
                <AppearanceSettings
                  resourceType={resourceType}
                  displayOptions={displayOptions}
                  onChangeDisplayOptions={setDisplayOptions}
                />
              }
              previewSlot={
                <>
                  <PreviewModeSelector
                    value={activePane}
                    onChange={setActivePane}
                  />
                  <PreviewPane
                    hidden={activePane !== "preview"}
                    className={CS.flexFull}
                    previewUrl={iframeUrl}
                    isTransparent={displayOptions.theme === "transparent"}
                  />
                  {activePane === "code"
                    ? getServerEmbedCodePane(EMBED_MODAL_TABS.Appearance)
                    : null}
                </>
              }
            />
          ) : null}
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
};

function getDefaultEmbeddingParams(
  resource: EmbedResource,
  resourceParameters: EmbedResourceParameter[],
): EmbeddingParameters {
  const validSlugs = resourceParameters.map(param => param.slug);
  // We first pick only dashboard parameters with valid slugs
  const defaultParams = _.pick(resource.embedding_params || {}, validSlugs);
  // Then pick valid required dashboard parameters
  const validRequiredParams = resourceParameters.filter(
    param => param.slug && param.required,
  );

  // And for each required parameter set its value to "enabled"
  // (Editable) because this is the default for a required parameter.
  // This is needed to save embedding_params when a user clicks
  // "Publish" without changing parameter visibility.
  return validRequiredParams.reduce((acc, param) => {
    if (!acc[param.slug] || acc[param.slug] === "disabled") {
      acc[param.slug] = "enabled";
    }
    return acc;
  }, defaultParams);
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
      getParameterValue({
        parameter,
        values: parameterValues,
        defaultRequired: true,
      }),
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

function convertResourceParametersToEmbeddingParams(
  resourceParameters: EmbedResourceParameter[],
) {
  const embeddingParams: EmbeddingParameters = {};
  for (const parameter of resourceParameters) {
    embeddingParams[parameter.slug] = "disabled";
  }

  return embeddingParams;
}
