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

export const PLUGIN_AUDIT = {
  isAuditDb: (_db: DatabaseType) => false,
  InsightsLink: PluginPlaceholder as ComponentType<InsightsLinkProps>,
};
