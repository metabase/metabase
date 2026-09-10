import type { DateRangePickerProps } from "embedding-sdk-bundle/lib/data-app/date-range-picker";
import { getWindow } from "embedding-sdk-shared/lib/get-window";

export const DateRangePicker = (props: DateRangePickerProps) => {
  const BundleDateRangePicker =
    getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.DateRangePicker;

  if (!BundleDateRangePicker) {
    return null;
  }

  return <BundleDateRangePicker {...props} />;
};
