import { useSetting } from "metabase/common/hooks";
import {
  useGetBillingInfoQuery,
  useListAddOnsQuery,
} from "metabase-enterprise/api";
import { hasPremiumFeature } from "metabase-enterprise/settings";
import type { ICloudAddOnProduct } from "metabase-types/api";

const TRANSFORMS_PRODUCT_TYPES = ["transforms"] as const;

export function useTransformsBilling(): {
  error: unknown;
  isLoading: boolean;
  billingPeriodMonths: number | undefined;
  basicTransformsAddOn: ICloudAddOnProduct | undefined;
  advancedTransformsAddOn: ICloudAddOnProduct | undefined;
  hadTransforms: boolean;
  isOnTrial: boolean;
  trialEndDate: string | undefined;
  hasBasicTransforms: boolean;
} {
  const tokenStatus = useSetting("token-status");

  const {
    data: addOns,
    error: addOnsError,
    isLoading: addOnsLoading,
  } = useListAddOnsQuery();

  const {
    data: billingInfo,
    error: billingInfoError,
    isLoading: billingInfoLoading,
  } = useGetBillingInfoQuery();

  const billingPeriodMonths =
    billingInfo?.data?.billing_period_months ?? undefined;

  const hadTransforms =
    billingInfo?.data?.previous_add_ons?.some(
      ({ product_type, self_service }) =>
        TRANSFORMS_PRODUCT_TYPES.includes(
          product_type as (typeof TRANSFORMS_PRODUCT_TYPES)[number],
        ) && self_service,
    ) ?? false;

  const basicTransformsAddOn = addOns?.find(
    ({ active, billing_period_months, product_type, self_service }) =>
      active &&
      self_service &&
      billing_period_months === billingPeriodMonths &&
      product_type === "transforms-basic",
  );

  const advancedTransformsAddOn = addOns?.find(
    ({ active, billing_period_months, product_type, self_service }) =>
      active &&
      self_service &&
      billing_period_months === billingPeriodMonths &&
      product_type === "transforms-advanced",
  );

  const isOnTrial = tokenStatus?.trial ?? false;
  const trialEndDate = tokenStatus?.["valid-thru"];

  // Check if user already has basic transforms (to show upgrade-only)
  const hasBasicTransforms = Boolean(
    hasPremiumFeature("transforms") && !hasPremiumFeature("transforms-python"),
  );

  return {
    error: addOnsError || billingInfoError,
    isLoading: addOnsLoading || billingInfoLoading,
    billingPeriodMonths,
    basicTransformsAddOn,
    advancedTransformsAddOn,
    hadTransforms,
    isOnTrial,
    trialEndDate,
    hasBasicTransforms,
  };
}
