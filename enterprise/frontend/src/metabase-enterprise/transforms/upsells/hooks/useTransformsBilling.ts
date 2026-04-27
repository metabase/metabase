import { getIsHosted } from "metabase/databases/selectors";
import { useSelector } from "metabase/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import {
  useGetBillingInfoQuery,
  useListAddOnsQuery,
} from "metabase-enterprise/api";

export function useTransformsBilling() {
  const isAdmin = useSelector(getUserIsAdmin);
  const isHosted = useSelector(getIsHosted);

  const {
    data: addOns,
    error: addOnsError,
    isLoading: addOnsLoading,
  } = useListAddOnsQuery(undefined, {
    skip: !isHosted || !isAdmin,
  });

  const {
    data: billingInfo,
    error: billingInfoError,
    isLoading: billingInfoLoading,
  } = useGetBillingInfoQuery();

  const hadTransforms =
    billingInfo?.data?.previous_add_ons?.some(
      ({ product_type, self_service }) =>
        product_type === "transforms-basic-metered" && self_service,
    ) ?? false;

  const hadAdvancedTransforms =
    billingInfo?.data?.previous_add_ons?.some(
      ({ product_type, self_service }) =>
        product_type === "transforms-advanced-metered" && self_service,
    ) ?? false;

  const basicTransformsAddOn = addOns?.find(
    ({ active, product_type, self_service }) =>
      active && self_service && product_type === "transforms-basic-metered",
  );

  const advancedTransformsAddOn = addOns?.find(
    ({ active, product_type, self_service }) =>
      active && self_service && product_type === "transforms-advanced-metered",
  );

  return {
    error: addOnsError || billingInfoError,
    isLoading: addOnsLoading || billingInfoLoading,
    basicTransformsAddOn,
    advancedTransformsAddOn,
    hadTransforms,
    hadAdvancedTransforms,
  };
}
