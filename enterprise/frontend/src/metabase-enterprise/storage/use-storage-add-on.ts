import { useListAddOnsQuery } from "metabase-enterprise/api";

export const STORAGE_PRODUCT_TYPE = "dwh-rent";

export function useStorageAddOn({ skip = false }: { skip?: boolean } = {}) {
  const { data: addOns, isLoading } = useListAddOnsQuery(undefined, {
    skip,
  });

  const storageAddOn = addOns?.find(
    ({ active, self_service, product_type }) =>
      active && self_service && product_type === STORAGE_PRODUCT_TYPE,
  );

  return { storageAddOn, isLoading };
}
