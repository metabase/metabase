import { PredefinedFilter } from "./constants";

export function getPredefinedFilter(
  filterId: PredefinedFilter,
): {
  operator: string;
  arguments: any[];
} {
  switch (filterId) {
    case PredefinedFilter.TODAY:
      return {
        operator: "time-interval",
        arguments: ["current", "day"],
      };
    case PredefinedFilter.YESTERDAY:
      return {
        operator: "time-interval",
        arguments: [-1, "day"],
      };
    case PredefinedFilter.LAST_WEEK:
      return {
        operator: "time-interval",
        arguments: [-1, "week"],
      };
    case PredefinedFilter.LAST_7_DAYS:
      return {
        operator: "time-interval",
        arguments: [-7, "day"],
      };
    case PredefinedFilter.LAST_30_DAYS:
      return {
        operator: "time-interval",
        arguments: [-30, "day"],
      };
    case PredefinedFilter.LAST_MONTH:
      return {
        operator: "time-interval",
        arguments: [-1, "month"],
      };
    case PredefinedFilter.LAST_3_MONTHS:
      return {
        operator: "time-interval",
        arguments: [-3, "month"],
      };
    case PredefinedFilter.LAST_12_MONTHS:
      return {
        operator: "time-interval",
        arguments: [-12, "month"],
      };
    default: {
      const missingFilter: never = filterId;
      throw new Error(`Unsupported predefined filter id: ${missingFilter}`);
    }
  }
}
