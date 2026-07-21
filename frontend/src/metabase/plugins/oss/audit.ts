import type { ComponentType } from "react";

import type { LinkProps } from "metabase/common/components/Link";
import type {
  MetabotAgentId,
  SlashCommand,
} from "metabase/metabot/state/types";
import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";
import type { Dispatch, GetState } from "metabase/redux/store";
import type Question from "metabase-lib/v1/Question";
import type {
  Card,
  Dashboard,
  Database as DatabaseType,
  IconName,
} from "metabase-types/api";

export type MetabotSlashCommandHandler = (args: {
  command: SlashCommand;
  agentId: MetabotAgentId;
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

const getDefaultPluginAudit = () => ({
  isEnabled: false,
  isAuditDb: (_db: DatabaseType) => false,
  // Unjustified type cast. FIXME
  InsightsLink: PluginPlaceholder as ComponentType<InsightsLinkProps>,
  // Unjustified type cast. FIXME
  InsightsMenuItem: PluginPlaceholder as ComponentType<InsightsMenuItemProps>,
  // Unjustified type cast. FIXME
  handleMetabotSlashCommand: ((_args) => false) as MetabotSlashCommandHandler,
});

export const PLUGIN_AUDIT = getDefaultPluginAudit();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_AUDIT, getDefaultPluginAudit());
}
