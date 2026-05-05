import type { ReactNode } from "react";
import { jt, t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { useListMetabotsQuery } from "metabase/api";
import { useAdminSetting } from "metabase/api/utils";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import { Link } from "metabase/common/components/Link";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useDocsUrl, useSetting } from "metabase/common/hooks";
import { FIXED_METABOT_IDS } from "metabase/metabot/constants";
import {
  PLUGIN_EMBEDDING_IFRAME_SDK,
  PLUGIN_EMBEDDING_SDK,
} from "metabase/plugins";
import { useRouter } from "metabase/router/useRouter";
import { Divider, Flex, Stack, Switch, Tabs } from "metabase/ui";

import { McpAppsSettings } from "./McpAppsSettings";
import { MetabotSettingsPanel } from "./MetabotSettingsPanel";
import { MetabotSetup } from "./MetabotSetup";

type MetabotTabValue = "embedded" | "internal";

const SETUP_SECTION_ID = "setup";
const METABOT_SECTION_ID = "metabot";
const MCP_SECTION_ID = "mcp";
const AGENT_API_SECTION_ID = "agent-api";
const AI_FEATURES_ENABLED_SECTION_ID = "ai-features-enabled";

const DEFAULT_METABOT_PATH = `/admin/metabot/${FIXED_METABOT_IDS.DEFAULT}`;
const EMBEDDED_METABOT_PATH = `/admin/metabot/${FIXED_METABOT_IDS.EMBEDDED}`;

export function AISettingsPage() {
  const {
    location: { pathname },
    params,
  } = useRouter();

  const isConfigured = !!useSetting("llm-metabot-configured?");
  const hasEmbedding =
    PLUGIN_EMBEDDING_SDK.isEnabled() || PLUGIN_EMBEDDING_IFRAME_SDK.isEnabled();

  const {
    value: aiFeaturesEnabledValue,
    updateSetting: updateAiSetting,
    isLoading: isUpdatingAiFeatures,
  } = useAdminSetting("ai-features-enabled?");
  const areAiFeaturesEnabled = aiFeaturesEnabledValue !== false;

  const {
    value: agentApiEnabledValue,
    updateSetting: updateAgentApiSetting,
    isLoading: isUpdatingAgentApi,
  } = useAdminSetting("agent-api-enabled?");
  const isAgentApiEnabled = agentApiEnabledValue !== false;

  // eslint-disable-next-line metabase/no-unconditional-metabase-links-render -- Admin settings
  const { url: agentApiDocsUrl } = useDocsUrl("ai/agent-api");

  const selectedTab = getSelectedMetabotTab(params.metabotId, pathname, {
    hasEmbedding,
  });

  const handleAiFeaturesEnabledChange = async (checked: boolean) => {
    await updateAiSetting({
      key: "ai-features-enabled?",
      value: !checked,
    });
  };

  const handleAgentApiChange = async (checked: boolean) => {
    await updateAgentApiSetting({
      key: "agent-api-enabled?",
      value: checked,
    });
  };

  return (
    <SettingsPageWrapper
      title={t`AI features`}
      description={t`Manage AI integrations and Metabot.`}
    >
      {areAiFeaturesEnabled && (
        <>
          <MetabotSetup id={SETUP_SECTION_ID} />
          <DisabledSection disabled={!isConfigured}>
            <MetabotSettingsSection
              hasEmbedding={hasEmbedding}
              id={METABOT_SECTION_ID}
              selectedTab={selectedTab}
            />
          </DisabledSection>
          <Divider />
          <Stack gap="lg">
            <McpAppsSettings id={MCP_SECTION_ID} />

            <ToggleSettingsSection
              checked={isAgentApiEnabled}
              description={jt`Enable external access to the Agent API. ${(
                <ExternalLink key="docs" href={agentApiDocsUrl}>
                  {t`Learn more`}
                </ExternalLink>
              )}`}
              disabled={isUpdatingAgentApi}
              id={AGENT_API_SECTION_ID}
              onChange={handleAgentApiChange}
              title={t`Agent API`}
            />
          </Stack>

          <Divider />
        </>
      )}

      <ToggleSettingsSection
        checked={!areAiFeaturesEnabled}
        description={t`Turn this on to hide AI features across your instance.`}
        disabled={isUpdatingAiFeatures}
        id={AI_FEATURES_ENABLED_SECTION_ID}
        onChange={handleAiFeaturesEnabledChange}
        title={t`Disable all AI features`}
      />
    </SettingsPageWrapper>
  );
}

function MetabotSettingsSection({
  hasEmbedding,
  id,
  selectedTab,
}: {
  hasEmbedding: boolean;
  id: string;
  selectedTab: MetabotTabValue;
}) {
  const { data, isLoading, error } = useListMetabotsQuery();
  const activeMetabotId =
    selectedTab === "embedded"
      ? FIXED_METABOT_IDS.EMBEDDED
      : FIXED_METABOT_IDS.DEFAULT;
  const activeMetabot = data?.items.find((m) => m.id === activeMetabotId);
  const showTabs = hasEmbedding;

  return (
    <SettingsSection id={id} title={t`Metabot settings`}>
      {showTabs && (
        <Tabs value={selectedTab}>
          <Tabs.List>
            <Tabs.Tab
              renderRoot={(props) => (
                <Link {...props} to={getMetabotTabPath("internal")} />
              )}
              value="internal"
            >
              {t`Internal`}
            </Tabs.Tab>
            <Tabs.Tab
              renderRoot={(props) => (
                <Link {...props} to={getMetabotTabPath("embedded")} />
              )}
              value="embedded"
            >
              {t`Embedded`}
            </Tabs.Tab>
          </Tabs.List>
        </Tabs>
      )}

      {activeMetabot ? (
        <MetabotSettingsPanel metabot={activeMetabot} />
      ) : (
        <LoadingAndErrorWrapper
          loading={isLoading}
          error={error ? t`Error loading Metabot configuration` : null}
        />
      )}
    </SettingsSection>
  );
}

function ToggleSettingsSection({
  checked,
  description,
  disabled,
  id,
  onChange,
  title,
}: {
  checked: boolean;
  description: ReactNode;
  disabled: boolean;
  id: string;
  onChange: (checked: boolean) => Promise<void>;
  title: string;
}) {
  return (
    <SettingsSection
      id={id}
      title={
        <Flex align="center" gap="md" justify="space-between" w="100%">
          <div>{title}</div>
          <Switch
            aria-label={title}
            checked={checked}
            disabled={disabled}
            onChange={(event) => onChange(event.target.checked)}
            size="sm"
            w="auto"
          />
        </Flex>
      }
      description={description}
    >
      <></>
    </SettingsSection>
  );
}

function DisabledSection({
  children,
  disabled,
}: {
  children: ReactNode;
  disabled: boolean;
}) {
  return (
    <Stack
      gap="lg"
      opacity={disabled ? 0.4 : 1}
      aria-disabled={disabled || undefined}
      {...(disabled ? { inert: "" } : {})}
    >
      {children}
    </Stack>
  );
}

function getSelectedMetabotTab(
  metabotId: string | undefined,
  pathname: string,
  {
    hasEmbedding,
  }: {
    hasEmbedding: boolean;
  },
): MetabotTabValue {
  if (
    (metabotId === String(FIXED_METABOT_IDS.EMBEDDED) ||
      pathname === EMBEDDED_METABOT_PATH) &&
    hasEmbedding
  ) {
    return "embedded";
  }

  return "internal";
}

function getMetabotTabPath(tab: MetabotTabValue) {
  const pathname =
    tab === "embedded" ? EMBEDDED_METABOT_PATH : DEFAULT_METABOT_PATH;

  return `${pathname}#${METABOT_SECTION_ID}`;
}
