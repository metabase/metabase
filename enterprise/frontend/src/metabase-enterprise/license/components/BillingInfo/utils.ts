import { formatNumber, formatDateTimeWithUnit } from "metabase/lib/formatting";
import type { BillingInfoLineItem } from "metabase-types/api";
import {
  supportedFormatTypes,
  supportedDisplayTypes,
} from "metabase-types/api";

const supportedFormatTypesSet = new Set<string>(supportedFormatTypes);
const supportedDisplayTypesSet = new Set<string | undefined>(
  supportedDisplayTypes,
);

export const isSupportedLineItem = (lineItem: BillingInfoLineItem) => {
  return (
    supportedFormatTypesSet.has(lineItem.format) &&
    supportedDisplayTypesSet.has(lineItem.display)
  );
};

export const formatBillingValue = (lineItem: BillingInfoLineItem): string => {
  switch (lineItem.format) {
    case "string":
      return lineItem.value;
    case "integer":
      return formatNumber(lineItem.value);
    case "float":
      return formatNumber(lineItem.value, {
        minimumFractionDigits: lineItem.precision,
        maximumFractionDigits: lineItem.precision,
      });
    case "datetime": {
      const dow = formatDateTimeWithUnit(lineItem.value, "day-of-week");
      const day = formatDateTimeWithUnit(lineItem.value, "day");
      return `${dow}, ${day}`;
    }
    case "currency":
      return formatNumber(lineItem.value, {
        currency: lineItem.currency,
        number_style: "currency",
      });
    default: {
      const _exhaustiveCheck: never = lineItem;
      return "";
    }
  }
};

export const internalLinkMap: Record<string, string> = {
  "user-list": "/admin/people",
};

export const isUnsupportedInternalLink = (lineItem: BillingInfoLineItem) => {
  return lineItem.display === "internal-link"
    ? !internalLinkMap[lineItem.link]
    : false;
};

export const getBillingInfoId = (lineItem: BillingInfoLineItem) => {
  return lineItem.name.toLowerCase().replaceAll(" ", "-");
};
