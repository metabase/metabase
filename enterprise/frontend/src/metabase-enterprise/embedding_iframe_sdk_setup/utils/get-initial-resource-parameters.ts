import { getSavedDashboardUiParameters } from "metabase/parameters/utils/dashboards";
import type { EmbedResourceParameter } from "metabase/public/lib/types";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import { getCardUiParameters } from "metabase-lib/v1/parameters/utils/cards";
import type { Card, Dashboard } from "metabase-types/api";

export const getInitialResourceParameters = ({
  dashboard,
  card,
  metadata,
}: {
  dashboard: Dashboard | undefined;
  card: Card | undefined;
  metadata: Metadata;
}): EmbedResourceParameter[] | null => {
  if (dashboard) {
    return getSavedDashboardUiParameters(
      dashboard.dashcards,
      dashboard.parameters,
      dashboard.param_fields,
      metadata,
    );
  }

  if (card) {
    return getCardUiParameters(card, metadata);
  }

  return null;
};
