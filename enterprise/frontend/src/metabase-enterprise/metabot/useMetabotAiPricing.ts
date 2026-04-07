import { useMemo } from "react";

import { formatNumber } from "metabase/lib/formatting";
import { useListAddOnsQuery } from "metabase-enterprise/api";
import type { GetCloudAddOnsResponse } from "metabase-types/api";

import { formatMetabaseCost } from "./format";

type MetabotAiPricing = {
  price: string;
  unit: string;
  pricePerUnit: number;
  unitCount: number;
};

const UNIT_MULTIPLIER = 1_000_000;
const METABASE_AI_PRODUCT_TYPE = "metabase-ai-managed";

export function useMetabotAiPricing(
  shouldLoadMetabaseBilling: boolean,
): MetabotAiPricing | null {
  const { data: addOns } = useListAddOnsQuery(undefined, {
    skip: !shouldLoadMetabaseBilling,
  });

  return useMemo(() => getMetabaseAiPricing(addOns), [addOns]);
}

function getMetabaseAiPricing(addOns: GetCloudAddOnsResponse | undefined) {
  const addOn = addOns?.find(
    ({ active, product_type, self_service }) =>
      active && self_service && product_type === METABASE_AI_PRODUCT_TYPE,
  );

  if (addOn?.default_price_per_unit == null) {
    return null;
  }

  const unitCount = addOn.default_total_units * UNIT_MULTIPLIER;

  return {
    price: formatMetabaseCost(addOn.default_price_per_unit * UNIT_MULTIPLIER),
    unit: formatNumber(unitCount, {
      compact: true,
      maximumFractionDigits: 0,
    }) as string,
    pricePerUnit: addOn.default_price_per_unit * UNIT_MULTIPLIER,
    unitCount,
  };
}
