import { t } from "ttag";

import { EmptyState } from "metabase/common/components/EmptyState";
import { useSetting } from "metabase/common/hooks";
import { MonitorMain } from "metabase/monitor/components/MonitorLayout";
import { Outlet } from "metabase/router";
import { Flex } from "metabase/ui";
import * as Urls from "metabase/urls";

type UnavailablePageProps = {
  title: string;
  message: string;
  action: string;
  link: string;
};

function UnavailablePage({
  title,
  message,
  action,
  link,
}: UnavailablePageProps) {
  return (
    <MonitorMain align="center" h="100%">
      <Flex flex={1} align="center" justify="center">
        <EmptyState
          icon="metabot"
          title={title}
          message={message}
          action={action}
          link={link}
        />
      </Flex>
    </MonitorMain>
  );
}

export function MetabotAnalyticsAvailabilityLayout() {
  const aiFeaturesEnabled = !!useSetting("ai-features-enabled?");
  const isConfigured = !!useSetting("llm-metabot-configured?");

  if (!aiFeaturesEnabled) {
    return (
      <UnavailablePage
        title={t`AI features are disabled`}
        message={t`Enable AI features in Admin settings to view AI usage and conversations.`}
        action={t`Go to AI Settings`}
        link={Urls.adminAiSettings()}
      />
    );
  }

  if (!isConfigured) {
    return (
      <UnavailablePage
        title={t`Set up AI to view analytics`}
        message={t`Configure an AI provider in Admin settings to view AI usage and conversations.`}
        action={t`Go to AI Settings`}
        link={Urls.adminAiSettings()}
      />
    );
  }

  return <Outlet />;
}

export function McpAnalyticsAvailabilityLayout() {
  const aiFeaturesEnabled = !!useSetting("ai-features-enabled?");
  const mcpEnabled = !!useSetting("mcp-enabled?");

  if (!aiFeaturesEnabled) {
    return (
      <UnavailablePage
        title={t`AI features are disabled`}
        message={t`Enable AI features in Admin settings to view MCP analytics.`}
        action={t`Go to AI Settings`}
        link={Urls.adminAiSettings()}
      />
    );
  }

  if (!mcpEnabled) {
    return (
      <UnavailablePage
        title={t`MCP is disabled`}
        message={t`Enable MCP in Admin settings to view MCP analytics.`}
        action={t`Go to MCP settings`}
        link={Urls.adminMcpSettings()}
      />
    );
  }

  return <Outlet />;
}
