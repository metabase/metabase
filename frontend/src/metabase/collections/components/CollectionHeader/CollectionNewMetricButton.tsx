import { t } from "ttag";

import { ToolbarButton } from "metabase/common/components/ToolbarButton";
import { canUserCreateQueries } from "metabase/current-user";
import { useSelector } from "metabase/redux";
import { useNavigate } from "metabase/router";
import * as Urls from "metabase/urls";
import { isWithinIframe } from "metabase/utils/iframe";
import type { Collection } from "metabase-types/api";

/** The Library's Metrics collection, or a folder inside it. */
export function isLibraryMetricsCollection(collection: Collection): boolean {
  return (
    collection.type === "library-metrics" ||
    (collection.effective_ancestors ?? []).some(
      (ancestor) => ancestor.type === "library-metrics",
    )
  );
}

/**
 * PROTOTYPE: creating a metric otherwise means going through Data Studio's
 * Library, which only admins and entitled analysts can reach. This gives
 * anyone who can build queries a way in from the Metrics collection — the
 * same gate and `/metric/new` page as Browse metrics' "New metric" button.
 */
export function CollectionNewMetricButton({
  collection,
}: {
  collection: Collection;
}) {
  const navigate = useNavigate();
  const hasDataAccess = useSelector(canUserCreateQueries);

  if (!hasDataAccess || isWithinIframe()) {
    return null;
  }

  return (
    <ToolbarButton
      icon="add"
      tooltipLabel={t`New metric`}
      tooltipPosition="bottom"
      onClick={() =>
        navigate(
          Urls.newMetric({
            // Read-only (e.g. git-synced) folders can't take the new metric;
            // the save step then asks where it goes.
            collectionId: collection.can_write ? collection.id : undefined,
          }),
        )
      }
    />
  );
}
