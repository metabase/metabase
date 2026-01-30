import cx from "classnames";
import { useMemo, useState } from "react";
import { useAsync } from "react-use";
import { t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import CS from "metabase/css/core/index.css";
import { useSelector } from "metabase/lib/redux";
import { checkNotNull } from "metabase/lib/types";
import { getPreviewParamsBySlug } from "metabase/public/components/EmbedModal/StaticEmbedSetupPane/lib/get-preview-params-by-slug";
import { getStaticEmbedSetupPublishHandlers } from "metabase/public/components/EmbedModal/StaticEmbedSetupPane/lib/get-static-embed-setup-publish-handlers";
import { trackStaticEmbedCodeCopied } from "metabase/public/lib/analytics";
import { getEmbedServerCodeExampleOptions } from "metabase/public/lib/code";
import { getIframeQueryWithoutDefaults } from "metabase/public/lib/code-templates";
import { getSignedPreviewUrlWithoutHash } from "metabase/public/lib/embed";
import type {
  EmbedResource,
  EmbedResourceParameter,
  EmbeddingDisplayOptions,
  EmbeddingParameters,
  EmbeddingParametersValues,
  GuestEmbedResourceType,
} from "metabase/public/lib/types";
import { getCanWhitelabel } from "metabase/selectors/whitelabel";
import { Paper, Stack, Tabs } from "metabase/ui";

import { EmbedModalContentStatusBar } from "./EmbedModalContentStatusBar";
import { LookAndFeelSettings } from "./LookAndFeelSettings";
import { OverviewSettings } from "./OverviewSettings";
import { ParametersSettings } from "./ParametersSettings";
import { PreviewModeSelector } from "./PreviewModeSelector";
import { type PreviewBackgroundType, PreviewPane } from "./PreviewPane";
import { ServerEmbedCodePane } from "./ServerEmbedCodePane";
import { SettingsTabLayout } from "./StaticEmbedSetupPane.styled";
import { getDefaultDisplayOptions } from "./config";
import { getDefaultEmbeddingParams } from "./lib/get-default-embedding-params";
import { getHasParamsChanged } from "./lib/get-has-params-changed";
import { getLockedPreviewParameters } from "./lib/get-locked-preview-parameters";
import { EMBED_MODAL_TABS } from "./tabs";
import type { ActivePreviewPane, EmbedCodePaneVariant } from "./types";

export interface StaticEmbedSetupPaneProps {
  resource: EmbedResource;
  resourceType: GuestEmbedResourceType;
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
  const shouldShowDownloadData = canWhitelabel;
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
    withIframeSnippet: true,
  });

  const [selectedServerCodeOptionId, setSelectedServerCodeOptionId] = useState(
    serverCodeOptions[0].id,
  );

  const selectedServerCodeOption = serverCodeOptions.find(
    ({ id }) => id === selectedServerCodeOptionId,
  );

  const hasParamsChanged = getHasParamsChanged({
    initialEmbeddingParams,
    embeddingParams,
  });

  const { value: iframeUrlWithoutHash = null } = useAsync(
    async () =>
      getSignedPreviewUrlWithoutHash(
        siteUrl,
        resourceType,
        resource.id,
        previewParametersBySlug,
        secretKey,
        embeddingParams,
      ),
    [
      siteUrl,
      resourceType,
      resource.id,
      previewParametersBySlug,
      secretKey,
      embeddingParams,
    ],
  );

  const iframeUrl = iframeUrlWithoutHash
    ? iframeUrlWithoutHash + getIframeQueryWithoutDefaults(displayOptions)
    : null;

  const { handleSave, handleUnpublish, handleDiscard } =
    getStaticEmbedSetupPublishHandlers({
      resource,
      resourceType,
      resourceParameters,
      onUpdateEnableEmbedding,
      onUpdateEmbeddingParams,
      embeddingParams,
      setEmbeddingParams,
      exampleDashboardId,
    });

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
      lookAndFeel: "code_appearance",
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
    (typeof EMBED_MODAL_TABS)[keyof typeof EMBED_MODAL_TABS]
  >(EMBED_MODAL_TABS.Overview);

  return (
    <Stack gap={0}>
      <Paper withBorder shadow="sm" m="1.5rem 2rem" p="0.75rem 1rem">
        <EmbedModalContentStatusBar
          resourceType={resourceType}
          isPublished={resource.enable_embedding}
          hasSettingsChanges={hasParamsChanged}
          onSave={handleSave}
          onUnpublish={handleUnpublish}
          onDiscard={handleDiscard}
        />
      </Paper>

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
            value={EMBED_MODAL_TABS.LookAndFeel}
            onClick={() => setActiveTab(EMBED_MODAL_TABS.LookAndFeel)}
          >{t`Look and Feel`}</Tabs.Tab>
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
              onClientCodeCopy={(language) =>
                handleCodeCopy({ code: "view", variant: "overview", language })
              }
            />
          ) : activeTab === EMBED_MODAL_TABS.Parameters ? (
            <SettingsTabLayout
              settingsSlot={
                <ParametersSettings
                  resourceType={resourceType}
                  resourceParameters={resourceParameters}
                  withInitialValues={false}
                  embeddingParams={embeddingParams}
                  lockedParameters={lockedParameters}
                  parameterValues={parameterValues}
                  onChangeEmbeddingParameters={setEmbeddingParams}
                  onChangeParameterValue={({ id, value }) =>
                    setParameterValues((state) => ({
                      ...state,
                      [id]: value,
                    }))
                  }
                  onRemoveParameterValue={({ id }) =>
                    setParameterValues((state) => {
                      const nextState = { ...state };
                      delete nextState[id];
                      return nextState;
                    })
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
                    backgroundType={
                      !displayOptions.background
                        ? "checkerboard-light"
                        : "no-background"
                    }
                  />
                  {activePane === "code"
                    ? getServerEmbedCodePane(EMBED_MODAL_TABS.Parameters)
                    : null}
                </>
              }
            />
          ) : activeTab === EMBED_MODAL_TABS.LookAndFeel ? (
            <SettingsTabLayout
              settingsSlot={
                <LookAndFeelSettings
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
                    backgroundType={getBackgroundType(displayOptions)}
                  />
                  {activePane === "code"
                    ? getServerEmbedCodePane(EMBED_MODAL_TABS.LookAndFeel)
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

function getBackgroundType(
  displayOptions: Pick<EmbeddingDisplayOptions, "background" | "theme">,
): PreviewBackgroundType {
  if (displayOptions.background) {
    return "no-background";
  }

  if (displayOptions.theme === "night") {
    return "checkerboard-dark";
  }

  // `light` and `transparent` (backward compatible) theme
  return "checkerboard-light";
}
