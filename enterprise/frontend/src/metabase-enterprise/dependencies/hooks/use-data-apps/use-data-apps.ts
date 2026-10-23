import { useHasTokenFeature } from "metabase/common/hooks";
import { useListDataAppsQuery } from "metabase-enterprise/api";

/**
 * The data apps the user can read. Without the data apps feature, or with `skip`, it sends no
 * request; `hasDataApps` says whether the instance has the feature.
 */
export function useDataApps({ skip = false }: { skip?: boolean } = {}) {
  const hasDataApps = useHasTokenFeature("data-apps");
  const query = useListDataAppsQuery(undefined, { skip: skip || !hasDataApps });
  return { ...query, hasDataApps };
}
