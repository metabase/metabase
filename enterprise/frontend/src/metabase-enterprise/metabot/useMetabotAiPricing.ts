import { useMemo } from "react";

import { formatNumber } from "metabase/lib/formatting";
import {
  useGetBillingInfoQuery,
  useListAddOnsQuery,
} from "metabase-enterprise/api";
import type { BillingInfo, GetCloudAddOnsResponse } from "metabase-types/api";

import { formatMetabaseCost } from "./format";

type MetabotAiPricing = {
  price: string;
  unit: string;
  pricePerUnit: number;
  unitCount: number;
};

const METABASE_AI_PRODUCT_TYPE = "metabase-ai-managed";

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
        product_type === METABASE_AI_PRODUCT_TYPE &&
        billingPeriodMonths != null &&
        billing_period_months === billingPeriodMonths,
    ) ??
    addOns?.find(
      ({ active, product_type, self_service }) =>
        active && self_service && product_type === METABASE_AI_PRODUCT_TYPE,
    );

  if (addOn?.default_price_per_unit == null) {
    return null;
  }

  const unitCount =
    addOn.default_total_units || addOn.default_prepaid_units || 1_000_000;

  return {
    price: formatMetabaseCost(addOn.default_price_per_unit),
    unit: formatNumber(unitCount, {
      compact: true,
      maximumFractionDigits: 0,
    }) as string,
    pricePerUnit: addOn.default_price_per_unit,
    unitCount,
  };
}
