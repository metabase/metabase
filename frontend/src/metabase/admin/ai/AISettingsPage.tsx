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
import { UpsellGem } from "metabase/common/components/upsells/components/UpsellGem";
import { useDocsUrl, useSetting } from "metabase/common/hooks";
import { FIXED_METABOT_IDS } from "metabase/metabot/constants";
import {
  PLUGIN_EMBEDDING_IFRAME_SDK,
  PLUGIN_EMBEDDING_SDK,
} from "metabase/plugins";
import { useRouter } from "metabase/router/useRouter";
import { Divider, Flex, Stack, Switch, Tabs } from "metabase/ui";

import { AIProviderSettingsSection } from "./AIProviderSettingsSection";
import { EmbeddedMetabotUpsell } from "./EmbeddedMetabotUpsell";
import { McpAppsSettings } from "./McpAppsSettings";
import { MetabotSettingsPanel } from "./MetabotSettingsPanel";

type MetabotTabId =
  | typeof FIXED_METABOT_IDS.DEFAULT
  | typeof FIXED_METABOT_IDS.EMBEDDED;

const SETUP_SECTION_ID = "setup";
const METABOT_SECTION_ID = "metabot";
const MCP_SECTION_ID = "mcp";
const AGENT_API_SECTION_ID = "agent-api";
const AI_FEATURES_ENABLED_SECTION_ID = "ai-features-enabled";
const METABOT_SETTINGS_PATH = "/admin/metabot";
const METABOT_ID_QUERY_PARAM = "metabot_id";

export function AISettingsPage() {
  const {
    location: { query },
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

  const selectedMetabotId = getSelectedMetabotId(
    query?.[METABOT_ID_QUERY_PARAM],
  );

  const handleAiFeaturesEnabledChange = async (checked: boolean) => {
    await updateAiSetting({
      key: "ai-features-enabled?",
      value: !checked,
    });
  };

  return (
    <SettingsPageWrapper
      title={t`AI features`}
      description={t`Manage your AI provider connection and Metabot.`}
    >
      {areAiFeaturesEnabled && (
        <>
          <AIProviderSettingsSection id={SETUP_SECTION_ID} />
          <DisabledSection disabled={!isConfigured}>
            <MetabotSettingsSection
              hasEmbedding={hasEmbedding}
              id={METABOT_SECTION_ID}
              selectedMetabotId={selectedMetabotId}
            />
          </DisabledSection>
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

export function McpSettingsPage() {
  const { value: aiFeaturesEnabledValue } = useAdminSetting(
    "ai-features-enabled?",
  );
  const areAiFeaturesEnabled = aiFeaturesEnabledValue !== false;

  return (
    <SettingsPageWrapper
      title={t`MCP`}
      description={t`Manage MCP server and Agent API access.`}
    >
      <DisabledSection disabled={!areAiFeaturesEnabled}>
        <McpAppsSettings id={MCP_SECTION_ID} />

        <AgentApiSettingsSection disabled={!areAiFeaturesEnabled} />
      </DisabledSection>
    </SettingsPageWrapper>
  );
}

function AgentApiSettingsSection({ disabled }: { disabled: boolean }) {
  const {
    value: agentApiEnabledValue,
    updateSetting: updateAgentApiSetting,
    isLoading: isUpdatingAgentApi,
  } = useAdminSetting("agent-api-enabled?");
  const isAgentApiEnabled = agentApiEnabledValue !== false;

  const { url: agentApiDocsUrl } = useDocsUrl("ai/agent-api");

  const handleAgentApiChange = async (checked: boolean) => {
    await updateAgentApiSetting({
      key: "agent-api-enabled?",
      value: checked,
    });
  };

  return (
    <ToggleSettingsSection
      checked={isAgentApiEnabled}
      description={jt`Enable external access to the Agent API. ${(
        <ExternalLink key="docs" href={agentApiDocsUrl}>
          {t`Learn more`}
        </ExternalLink>
      )}`}
      disabled={disabled || isUpdatingAgentApi}
      id={AGENT_API_SECTION_ID}
      onChange={handleAgentApiChange}
      title={t`Agent API`}
    />
  );
}

function MetabotSettingsSection({
  hasEmbedding,
  id,
  selectedMetabotId,
}: {
  hasEmbedding: boolean;
  id: string;
  selectedMetabotId: MetabotTabId;
}) {
  const { data, isLoading, error } = useListMetabotsQuery();
  const shouldShowUpsell =
    !hasEmbedding && selectedMetabotId === FIXED_METABOT_IDS.EMBEDDED;
  const activeMetabot = !shouldShowUpsell
    ? data?.items.find((m) => m.id === selectedMetabotId)
    : null;

  return (
    <SettingsSection id={id} title={t`Metabot settings`}>
      <Tabs value={String(selectedMetabotId)}>
        <Tabs.List>
          <Tabs.Tab
            renderRoot={(props) => (
              <Link
                {...props}
                to={getMetabotTabPath(FIXED_METABOT_IDS.DEFAULT)}
              />
            )}
            value={String(FIXED_METABOT_IDS.DEFAULT)}
          >
            {t`Internal`}
          </Tabs.Tab>
          <Tabs.Tab
            renderRoot={(props) => (
              <Link
                {...props}
                to={getMetabotTabPath(FIXED_METABOT_IDS.EMBEDDED)}
              />
            )}
            value={String(FIXED_METABOT_IDS.EMBEDDED)}
            rightSection={!hasEmbedding && <UpsellGem.New size={14} />}
          >
            {t`Embedded`}
          </Tabs.Tab>
        </Tabs.List>
      </Tabs>

      {activeMetabot ? (
        <MetabotSettingsPanel metabot={activeMetabot} />
      ) : shouldShowUpsell ? (
        <EmbeddedMetabotUpsell />
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

function getSelectedMetabotId(metabotId: string | undefined): MetabotTabId {
  if (metabotId === String(FIXED_METABOT_IDS.EMBEDDED)) {
    return FIXED_METABOT_IDS.EMBEDDED;
  }

  return FIXED_METABOT_IDS.DEFAULT;
}

function getMetabotTabPath(metabotId: MetabotTabId) {
  return {
    pathname: METABOT_SETTINGS_PATH,
    query: {
      [METABOT_ID_QUERY_PARAM]: String(metabotId),
    },
  };
}
