import {
  useGetBillingInfoQuery,
  useListAddOnsQuery,
} from "metabase-enterprise/api";
import type { ICloudAddOnProductTier } from "metabase-types/api";

const METABASE_AI_PRODUCT_TYPES = [
  "metabase-ai",
  "metabase-ai-tiered",
] as const;

export function useAddOnsBilling(): {
  error: unknown;
  isLoading: boolean;
  billingPeriodMonths: number | undefined;
  defaultQuantity: number | undefined;
  hadMetabot: boolean;
  tiers: ICloudAddOnProductTier[];
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
  const hadMetabot =
    billingInfo?.data?.previous_add_ons?.some(
      ({ product_type, self_service }) =>
        METABASE_AI_PRODUCT_TYPES.includes(
          product_type as (typeof METABASE_AI_PRODUCT_TYPES)[number],
        ) && self_service,
    ) ?? false;
  const tiers =
    addOns?.find(
      ({ active, billing_period_months, product_type, self_service }) =>
        active &&
        self_service &&
        billing_period_months === billingPeriodMonths &&
        product_type === "metabase-ai-tiered",
    )?.product_tiers ?? [];
  const defaultQuantity =
    tiers.find(({ is_default }) => is_default)?.quantity ?? tiers[0]?.quantity;

  return {
    error: addOnsError || billingInfoError,
    isLoading: addOnsLoading || billingInfoLoading,
    billingPeriodMonths,
    defaultQuantity,
    tiers,
    hadMetabot,
  };
}
