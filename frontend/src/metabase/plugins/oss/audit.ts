import type { ComponentType } from "react";

import type { LinkProps } from "metabase/common/components/Link";
import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";
import type Question from "metabase-lib/v1/Question";
import type { Dashboard, Database as DatabaseType } from "metabase-types/api";

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

const getDefaultPluginAudit = () => ({
  isAuditDb: (_db: DatabaseType) => false,
  InsightsLink: PluginPlaceholder as ComponentType<InsightsLinkProps>,
});

export const PLUGIN_AUDIT = getDefaultPluginAudit();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_AUDIT, getDefaultPluginAudit());
}
