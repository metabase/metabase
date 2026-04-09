import { useMemo } from "react";

import {
  type FormatNumberOptions,
  formatNumber,
} from "metabase/lib/formatting";
import { useListAddOnsQuery } from "metabase-enterprise/api";
import type { GetCloudAddOnsResponse } from "metabase-types/api";

import {
  METABASE_MANAGED_AI_PRODUCT_TYPE,
  METABASE_MANAGED_AI_UNIT_MULTIPLIER,
} from "./constants";
import { formatMetabaseCost } from "./format";

export type MetabaseManagedAiPricing = {
  price: string;
  unit: string;
  pricePerUnit: number;
  unitCount: number;
};

type UseMetabaseManagedAiPricingResult = {
  isLoading: boolean;
  pricing: MetabaseManagedAiPricing | null;
};

const COMPACT_NUMBER_FORMAT_OPTIONS: FormatNumberOptions = {
  compact: true,
  maximumFractionDigits: 0,
};

export function useMetabaseManagedAiPricing(
  shouldLoadMetabaseBilling: boolean,
): UseMetabaseManagedAiPricingResult {
  const { data: addOns, isLoading } = useListAddOnsQuery(undefined, {
    skip: !shouldLoadMetabaseBilling,
  });

  const pricing = useMemo(() => getMetabaseManagedAiPricing(addOns), [addOns]);

  return {
    isLoading: shouldLoadMetabaseBilling && isLoading,
    pricing,
  };
}

function getMetabaseManagedAiPricing(
  addOns: GetCloudAddOnsResponse | undefined,
): MetabaseManagedAiPricing | null {
  const addOn = addOns?.find(
    ({ active, product_type, self_service }) =>
      active &&
      self_service &&
      product_type === METABASE_MANAGED_AI_PRODUCT_TYPE,
  );

  if (addOn?.default_price_per_unit == null) {
    return null;
  }

  const unitCount =
    addOn.default_total_units * METABASE_MANAGED_AI_UNIT_MULTIPLIER;
  const pricePerUnit =
    addOn.default_price_per_unit * METABASE_MANAGED_AI_UNIT_MULTIPLIER;

  return {
    price: formatMetabaseCost(pricePerUnit),
    unit: formatNumber(unitCount, COMPACT_NUMBER_FORMAT_OPTIONS),
    pricePerUnit,
    unitCount,
  };
}
