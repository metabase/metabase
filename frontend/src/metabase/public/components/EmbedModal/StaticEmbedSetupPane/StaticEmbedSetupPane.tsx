import { t } from "ttag";
import { Tabs } from "metabase/ui";
import { EMBED_MODAL_TABS } from "./tabs";
import type { AppearanceSettingsProps } from "./AppearanceSettings";
import { AppearanceSettings } from "./AppearanceSettings";
import type { OverviewSettingsProps } from "./OverviewSettings";
import { OverviewSettings } from "./OverviewSettings";

import type { ParametersSettingsProps } from "./ParametersSettings";
import { ParametersSettings } from "./ParametersSettings";

type StaticEmbedSetupPaneProps = OverviewSettingsProps &
  ParametersSettingsProps &
  AppearanceSettingsProps;

export const StaticEmbedSetupPane = ({
  activePane,
  resource,
  resourceType,
  embedType,
  token,
  iframeUrl,
  siteUrl,
  secretKey,
  params,
  displayOptions,
  lockedParameters,
  parameterValues,
  resourceParameters,
  embeddingParams,
  onChangeDisplayOptions,
  onChangeEmbeddingParameters,
  onChangeParameterValue,
  onChangePane,
}: StaticEmbedSetupPaneProps): JSX.Element => {
  return (
    <Tabs
      defaultValue={EMBED_MODAL_TABS.Overview}
      data-testid="embedding-preview"
    >
      <Tabs.List p="0 1.5rem">
        <Tabs.Tab value={EMBED_MODAL_TABS.Overview}>{t`Overview`}</Tabs.Tab>
        <Tabs.Tab value={EMBED_MODAL_TABS.Parameters}>{t`Parameters`}</Tabs.Tab>
        <Tabs.Tab value={EMBED_MODAL_TABS.Appearance}>{t`Appearance`}</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value={EMBED_MODAL_TABS.Overview}>
        <OverviewSettings
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
      <Tabs.Panel value={EMBED_MODAL_TABS.Parameters}>
        <ParametersSettings
          activePane={activePane}
          resource={resource}
          resourceType={resourceType}
          resourceParameters={resourceParameters}
          embeddingParams={embeddingParams}
          lockedParameters={lockedParameters}
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
      <Tabs.Panel value={EMBED_MODAL_TABS.Appearance}>
        <AppearanceSettings
          activePane={activePane}
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
  );
};
