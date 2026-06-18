import { useListAddOnsQuery } from "metabase/api/cloud-add-ons";
import { useSetting } from "metabase/common/hooks";
import { useSelector } from "metabase/redux";
import { getUserIsAdmin } from "metabase/selectors/user";

export const STORAGE_PRODUCT_TYPE = "dwh-rent";
const HOSTING_DEPLOYMENT = "hosting";

/**
 * Fetches the self-service Metabase Storage (`dwh-rent`) add-on so it can be purchased in-app.
 * Only Cloud (hosted) admins can purchase, so the query is skipped otherwise. When no purchasable
 * add-on is returned, callers should fall back to linking out to the store.
 */
export function useStorageBilling() {
  const isHosted = useSetting("is-hosted?");
  const isAdmin = useSelector(getUserIsAdmin);

  const {
    data: addOns,
    isLoading,
    error,
  } = useListAddOnsQuery(undefined, {
    skip: !isHosted || !isAdmin,
  });

  const storageAddOn = addOns?.find(
    ({ active, self_service, product_type, deployment }) =>
      active &&
      self_service &&
      product_type === STORAGE_PRODUCT_TYPE &&
      deployment === HOSTING_DEPLOYMENT,
  );

  return { storageAddOn, isLoading, error };
}
