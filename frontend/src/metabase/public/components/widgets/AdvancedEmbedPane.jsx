/* eslint-disable react/prop-types */
import _ from "underscore";

import { t } from "ttag";
import { Tabs } from "metabase/ui";
import { EmbeddingModalContentParametersSettings } from "./EmbeddingModal/EmbeddingModalContentParametersSettings";
import { EmbeddingModalContentAppearanceSettings } from "./EmbeddingModal/EmbeddingModalContentAppearanceSettings";
import { EmbeddingModalContentStatusBar } from "./EmbeddingModal/EmbeddingModalContentStatusBar";
import { EmbeddingModalContentOverviewSettings } from "./EmbeddingModal/EmbeddingModalContentOverviewSettings";

const TABS = {
  Overview: "overview",
  Parameters: "parameters",
  Appearance: "appearance",
};

const AdvancedEmbedPane = ({
  pane,
  resource,
  resourceType,
  embedType,
  token,
  iframeUrl,
  siteUrl,
  secretKey,
  params,
  displayOptions,
  previewParameters,
  parameterValues,
  resourceParameters,
  embeddingParams,
  onChangeDisplayOptions,
  onChangeEmbeddingParameters,
  onChangeParameterValue,
  onChangePane,
  onSave,
  onUnpublish,
  onDiscard,
}) => {
  const hasSettingsChanges = !_.isEqual(
    resource.embedding_params,
    embeddingParams,
  );

  return (
    <div className="full flex">
      <div
        className="flex-full flex flex-column"
        data-testid="embedding-preview"
      >
        <EmbeddingModalContentStatusBar
          resourceType={resourceType}
          isEmbeddingEnabled={resource.enable_embedding}
          hasSettingsChanges={hasSettingsChanges}
          onSave={onSave}
          onUnpublish={onUnpublish}
          onDiscard={onDiscard}
        />
        <Tabs defaultValue={TABS.Overview}>
          <Tabs.List p="0 1.5rem">
            <Tabs.Tab value={TABS.Overview}>{t`Overview`}</Tabs.Tab>
            <Tabs.Tab value={TABS.Parameters}>{t`Parameters`}</Tabs.Tab>
            <Tabs.Tab value={TABS.Appearance}>{t`Appearance`}</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value={TABS.Overview}>
            <EmbeddingModalContentOverviewSettings
              embedType={embedType}
              resource={resource}
              resourceType={resourceType}
              iframeUrl={iframeUrl}
              token={token}
              siteUrl={siteUrl}
              secretKey={secretKey}
              params={params}
              displayOptions={displayOptions}
            />
          </Tabs.Panel>
          <Tabs.Panel value={TABS.Parameters}>
            <EmbeddingModalContentParametersSettings
              activePane={pane}
              resource={resource}
              resourceType={resourceType}
              resourceParameters={resourceParameters}
              embeddingParams={embeddingParams}
              previewParameters={previewParameters}
              parameterValues={parameterValues}
              embedType={embedType}
              iframeUrl={iframeUrl}
              token={token}
              siteUrl={siteUrl}
              secretKey={secretKey}
              params={params}
              displayOptions={displayOptions}
              onChangeEmbeddingParameters={onChangeEmbeddingParameters}
              onChangeParameterValue={onChangeParameterValue}
              onChangePane={onChangePane}
            />
          </Tabs.Panel>
          <Tabs.Panel value={TABS.Appearance}>
            <EmbeddingModalContentAppearanceSettings
              activePane={pane}
              embedType={embedType}
              resource={resource}
              resourceType={resourceType}
              iframeUrl={iframeUrl}
              token={token}
              siteUrl={siteUrl}
              secretKey={secretKey}
              params={params}
              displayOptions={displayOptions}
              onChangePane={onChangePane}
              onChangeDisplayOptions={onChangeDisplayOptions}
            />
          </Tabs.Panel>
        </Tabs>
      </div>
    </div>
  );
};

export default AdvancedEmbedPane;
