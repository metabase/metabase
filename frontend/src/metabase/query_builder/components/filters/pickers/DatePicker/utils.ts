import { PredefinedFilterId } from "./constants";

export function getPredefinedFilter(
  filterId: PredefinedFilterId,
): {
  operator: string;
  arguments: any[];
} {
  switch (filterId) {
    case "today":
      return {
        operator: "time-interval",
        arguments: ["current", "day"],
      };
    case "yesterday":
      return {
        operator: "time-interval",
        arguments: [-1, "day"],
      };
    case "last-week":
      return {
        operator: "time-interval",
        arguments: [-1, "week"],
      };
    case "last-7-days":
      return {
        operator: "time-interval",
        arguments: [-7, "day"],
      };
    case "last-30-days":
      return {
        operator: "time-interval",
        arguments: [-30, "day"],
      };
    case "last-month":
      return {
        operator: "time-interval",
        arguments: [-1, "month"],
      };
    case "last-3-months":
      return {
        operator: "time-interval",
        arguments: [-3, "month"],
      };
    case "last-12-months":
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
