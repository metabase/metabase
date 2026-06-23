import { useListAddOnsQuery } from "metabase/api/cloud-add-ons";
import { useSetting } from "metabase/common/hooks";
import { useSelector } from "metabase/redux";
import { getUserIsAdmin } from "metabase/selectors/user";

export const STORAGE_PRODUCT_TYPE = "dwh-rent";

export function useStorageAddOn({ skip = false }: { skip?: boolean } = {}) {
  const isHosted = useSetting("is-hosted?");
  const isAdmin = useSelector(getUserIsAdmin);

  const { data: addOns, isLoading } = useListAddOnsQuery(undefined, {
    skip: skip || !isHosted || !isAdmin,
  });

  const storageAddOn = addOns?.find(
    ({ active, self_service, product_type }) =>
      active && self_service && product_type === STORAGE_PRODUCT_TYPE,
  );

  return { storageAddOn, isLoading };
}
