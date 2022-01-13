import { PredefinedFilter } from "./constants";

import Filter from "metabase-lib/lib/queries/structured/Filter";

export function updateToPredefinedFilter(
  filter: Filter,
  filterId: PredefinedFilter,
): Filter {
  const { operator, args } = getPredefinedFilterOperatorAndArgs(filterId);
  return filter.setOperator(operator).setArguments(args);
}

function getPredefinedFilterOperatorAndArgs(
  filterId: PredefinedFilter,
): {
  operator: string;
  args: any[];
} {
  switch (filterId) {
    case PredefinedFilter.TODAY:
      return {
        operator: "time-interval",
        args: ["current", "day"],
      };
    case PredefinedFilter.YESTERDAY:
      return {
        operator: "time-interval",
        args: [-1, "day"],
      };
    case PredefinedFilter.LAST_WEEK:
      return {
        operator: "time-interval",
        args: [-1, "week"],
      };
    case PredefinedFilter.LAST_7_DAYS:
      return {
        operator: "time-interval",
        args: [-7, "day"],
      };
    case PredefinedFilter.LAST_30_DAYS:
      return {
        operator: "time-interval",
        args: [-30, "day"],
      };
    case PredefinedFilter.LAST_MONTH:
      return {
        operator: "time-interval",
        args: [-1, "month"],
      };
    case PredefinedFilter.LAST_3_MONTHS:
      return {
        operator: "time-interval",
        args: [-3, "month"],
      };
    case PredefinedFilter.LAST_12_MONTHS:
      return {
        operator: "time-interval",
        args: [-12, "month"],
      };
    default: {
      const missingFilter: never = filterId;
      throw new Error(`Unsupported predefined filter id: ${missingFilter}`);
    }
  }
}
