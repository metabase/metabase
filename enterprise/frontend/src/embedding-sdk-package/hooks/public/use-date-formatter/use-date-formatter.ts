import type { DateRangeValue } from "embedding-sdk-bundle/components/public/DateRangeCalendar/DateRangeCalendar";
import type {
  FormatDateOptions,
  FormatDateRangeOptions,
} from "embedding-sdk-bundle/lib/format-date-range";
import { useSdkLoadingState } from "embedding-sdk-shared/hooks/use-sdk-loading-state";
import { getWindow } from "embedding-sdk-shared/lib/get-window";

export type DateFormatter = {
  formatDate: (
    value: string | null | undefined,
    options?: FormatDateOptions,
  ) => string;
  formatDateRange: (
    value: DateRangeValue | null | undefined,
    options?: FormatDateRangeOptions,
  ) => string;
};

const NOT_LOADED: DateFormatter = {
  formatDate: () => "",
  formatDateRange: () => "",
};

export const useDateFormatter = (): DateFormatter => {
  useSdkLoadingState();

  const bundle = getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE;

  if (!bundle?.formatDate || !bundle.formatDateRange) {
    return NOT_LOADED;
  }

  return {
    formatDate: bundle.formatDate,
    formatDateRange: bundle.formatDateRange,
  };
};
