import type { ComponentType } from "react";

import type { LinkProps } from "metabase/common/components/Link";
import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";
import type { IconName } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import type {
  Card,
  Dashboard,
  Database as DatabaseType,
} from "metabase-types/api";

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
}

const getDefaultPluginAudit = () => ({
  isEnabled: false,
  isAuditDb: (_db: DatabaseType) => false,
  InsightsLink: PluginPlaceholder as ComponentType<InsightsLinkProps>,
  InsightsMenuItem: PluginPlaceholder as ComponentType<InsightsMenuItemProps>,
});

export const PLUGIN_AUDIT = getDefaultPluginAudit();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_AUDIT, getDefaultPluginAudit());
}
