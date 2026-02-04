import {
  useGetBillingInfoQuery,
  useListAddOnsQuery,
} from "metabase-enterprise/api";
import type { ICloudAddOnProduct } from "metabase-types/api";

const TRANSFORMS_PRODUCT_TYPES = ["transforms"] as const;

export function useTransformsBilling(): {
  error: unknown;
  isLoading: boolean;
  billingPeriodMonths: number | undefined;
  transformsProduct: ICloudAddOnProduct | undefined;
  pythonProduct: ICloudAddOnProduct | undefined;
  hadTransforms: boolean;
} {
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

  const transformsProduct = addOns?.find(
    ({ active, billing_period_months, product_type, self_service }) =>
      active &&
      self_service &&
      billing_period_months === billingPeriodMonths &&
      product_type === "transforms-basic",
  );

  const pythonProduct = addOns?.find(
    ({ active, billing_period_months, product_type, self_service }) =>
      active &&
      self_service &&
      billing_period_months === billingPeriodMonths &&
      product_type === "transforms-advanced",
  );

  return {
    error: addOnsError || billingInfoError,
    isLoading: addOnsLoading || billingInfoLoading,
    billingPeriodMonths,
    transformsProduct,
    pythonProduct,
    hadTransforms,
  };
}
