import { formatNumber } from "metabase/utils/formatting";

export function formatMetabaseCost(value: number) {
  return formatNumber(value, {
    currency: "USD",
    number_style: "currency",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
