import { useMemo } from "react";

import {
  useGetBillingInfoQuery,
  useListAddOnsQuery,
} from "metabase-enterprise/api";
import type { BillingInfo, GetCloudAddOnsResponse } from "metabase-types/api";

type MetabotAiPricing = {
  price: string;
  unit: string;
  pricePerUnit: number;
  unitCount: number;
};

const METABASE_AI_PRODUCT_TYPES = [
  "metabase-ai-metered",
  // TODO ?
  "metabase-ai-tiered",
  "metabase-ai",
] as const;

export function useMetabotAiPricing(
  shouldLoadMetabaseBilling: boolean,
): MetabotAiPricing | null {
  const { data: addOns } = useListAddOnsQuery(undefined, {
    skip: !shouldLoadMetabaseBilling,
  });
  const { data: billingInfo } = useGetBillingInfoQuery(undefined, {
    skip: !shouldLoadMetabaseBilling,
  });

  return useMemo(
    () => getMetabaseAiPricing(addOns, billingInfo),
    [addOns, billingInfo],
  );
}

function getMetabaseAiPricing(
  addOns: GetCloudAddOnsResponse | undefined,
  billingInfo: BillingInfo | undefined,
) {
  const billingPeriodMonths = billingInfo?.data?.billing_period_months;

  const addOn =
    addOns?.find(
      ({ active, billing_period_months, product_type, self_service }) =>
        active &&
        self_service &&
        METABASE_AI_PRODUCT_TYPES.includes(
          product_type as (typeof METABASE_AI_PRODUCT_TYPES)[number],
        ) &&
        billingPeriodMonths != null &&
        billing_period_months === billingPeriodMonths,
    ) ??
    addOns?.find(
      ({ active, product_type, self_service }) =>
        active &&
        self_service &&
        METABASE_AI_PRODUCT_TYPES.includes(
          product_type as (typeof METABASE_AI_PRODUCT_TYPES)[number],
        ),
    );

  if (addOn?.default_price_per_unit == null) {
    return null;
  }

  const unitCount =
    addOn.default_total_units || addOn.default_prepaid_units || 1_000_000;

  return {
    price: formatUsd(addOn.default_price_per_unit),
    unit: formatCompactNumber(unitCount),
    pricePerUnit: addOn.default_price_per_unit,
    unitCount,
  };
}

function formatUsd(value: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
  }).format(value);
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 0,
  }).format(value);
}
