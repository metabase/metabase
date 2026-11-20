import { getUserIsAdmin } from "metabase/current-user";
import { useSelector } from "metabase/redux";
import { useSetting } from "metabase/settings";
import {
  useGetBillingInfoQuery,
  useListAddOnsQuery,
} from "metabase-enterprise/api";

export function useTransformsBilling() {
  const isAdmin = useSelector(getUserIsAdmin);
  const isHosted = useSetting("is-hosted?");

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
  } = useGetBillingInfoQuery(undefined, {
    skip: !isAdmin,
  });

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

  const instanceDeployment = isHosted ? "hosting" : "selfhosted";

  const basicTransformsAddOn = addOns?.find(
    ({ active, product_type, self_service, deployment }) =>
      active &&
      self_service &&
      product_type === "transforms-basic-metered" &&
      deployment === instanceDeployment,
  );

  const advancedTransformsAddOn = addOns?.find(
    ({ active, product_type, self_service, deployment }) =>
      active &&
      self_service &&
      product_type === "transforms-advanced-metered" &&
      deployment === instanceDeployment,
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
