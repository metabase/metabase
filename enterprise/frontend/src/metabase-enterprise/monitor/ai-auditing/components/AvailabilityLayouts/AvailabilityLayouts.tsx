import { t } from "ttag";

import EmptyDashboardBot from "assets/img/dashboard-empty.svg";
import { EmptyState } from "metabase/common/components/EmptyState";
import { useSetting } from "metabase/common/hooks";
import { MonitorMain } from "metabase/monitor/components/MonitorLayout";
import { Outlet } from "metabase/router";
import type { ButtonProps } from "metabase/ui";
import { Flex } from "metabase/ui";
import * as Urls from "metabase/urls";

type UnavailablePageProps = {
  title: string;
  message: string;
  action: string;
  link: string;
  actionVariant?: ButtonProps["variant"];
};

function UnavailablePage({
  title,
  message,
  action,
  link,
  actionVariant,
}: UnavailablePageProps) {
  return (
    <MonitorMain align="center" h="100%">
      <Flex flex={1} align="center" justify="center">
        <EmptyState
          illustrationElement={<img src={EmptyDashboardBot} />}
          title={title}
          message={message}
          action={action}
          link={link}
          actionVariant={actionVariant}
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
        actionVariant="default"
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
        actionVariant="default"
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
        actionVariant="default"
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
        actionVariant="default"
      />
    );
  }

  return <Outlet />;
}
