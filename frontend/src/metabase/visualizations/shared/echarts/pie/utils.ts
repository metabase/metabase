import { computeMaxDecimalsForValues } from "metabase/visualizations/lib/utils";

export function computeLegendDecimals({
  percentages,
}: {
  percentages: number[];
}) {
  return computeMaxDecimalsForValues(percentages, {
    style: "percent",
    maximumSignificantDigits: 3,
  });
}
