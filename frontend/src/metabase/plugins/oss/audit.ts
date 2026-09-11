import type { ComponentType, ReactNode } from "react";

import type { LinkProps } from "metabase/common/components/Link";
import type { SlashCommand } from "metabase/metabot/state/types";
import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";
import type { Dispatch, GetState } from "metabase/redux/store";
import type Question from "metabase-lib/v1/Question";
import type {
  Card,
  Dashboard,
  Database as DatabaseType,
  IconName,
} from "metabase-types/api";

import { definePluginSlot } from "../slot";

export type MetabotSlashCommandHandler = (args: {
  command: SlashCommand;
  conversationId: string;
  dispatch: Dispatch;
  getState: GetState;
}) => boolean;

export type InsightsLinkProps = (
  | {
      question: Pick<Question, "id" | "collection">;
      dashboard?: never;
    }
  | {
      question?: never;
      dashboard: Pick<Dashboard, "id" | "collection">;
    }
) &
  Omit<LinkProps, "to">;

export interface InsightsMenuItemProps {
  card: Pick<Card, "id" | "collection">;
  label?: string;
  iconName?: IconName;
  withDivider?: boolean;
}

type AuditPlugin = {
  isEnabled: boolean;
  isAuditDb: (db: DatabaseType) => boolean;
  InsightsLink: ComponentType<InsightsLinkProps>;
  InsightsMenuItem: ComponentType<InsightsMenuItemProps>;
  AnalyticsExportStatus: ComponentType;
  CollectionExportAnalytics: ComponentType;
  isAiAuditingEnabled: boolean;
  getAiAuditingRoutes: () => ReactNode;
  handleMetabotSlashCommand: MetabotSlashCommandHandler;
};

const getDefaultPluginAudit = (): AuditPlugin => ({
  isEnabled: false,
  isAuditDb: (_db) => false,
  InsightsLink: PluginPlaceholder,
  InsightsMenuItem: PluginPlaceholder,
  AnalyticsExportStatus: PluginPlaceholder,
  CollectionExportAnalytics: PluginPlaceholder,
  isAiAuditingEnabled: false,
  getAiAuditingRoutes: () => null,
  handleMetabotSlashCommand: (_args) => false,
});

export const PLUGIN_AUDIT = definePluginSlot(getDefaultPluginAudit);
