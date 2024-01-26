import { formatNumber, formatDateTimeWithUnit } from "metabase/lib/formatting";
import type { BillingInfoLineItem } from "metabase-types/api";
import {
  supportedFormatTypes,
  supportedDisplayTypes,
} from "metabase-types/api";

const supportedFormatTypesSet = new Set<string>(supportedFormatTypes);
const supportedDisplayTypesSet = new Set<string>(supportedDisplayTypes);

export const isSupportedLineItem = (lineItem: BillingInfoLineItem) => {
  const isFormatSupported = supportedFormatTypesSet.has(lineItem.format);
  const isDisplaySupported =
    !lineItem.display || supportedDisplayTypesSet.has(lineItem.display);
  return isFormatSupported && isDisplaySupported;
};

export const formatBillingValue = (lineItem: BillingInfoLineItem) => {
  switch (lineItem.format) {
    case "string":
      return lineItem.value;
    case "integer":
      return formatNumber(lineItem.value);
    case "datetime":
      // TODO: design doc shows "Friday, June 23, 2023" while this would display "June 23, 2023"
      return formatDateTimeWithUnit(lineItem.value, "day");
    case "currency":
      return formatNumber(lineItem.value, {
        currency: lineItem.currency,
        number_style: "currency",
      });
    default:
      return null;
  }
};
