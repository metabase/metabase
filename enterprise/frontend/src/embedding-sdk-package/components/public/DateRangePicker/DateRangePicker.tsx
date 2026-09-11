import type { DateRangePickerProps } from "embedding-sdk-bundle/lib/data-app/date-range-picker";
import { createComponent } from "embedding-sdk-package/components/private/ComponentWrapper/ComponentWrapper";
import { getWindow } from "embedding-sdk-shared/lib/get-window";

export const DateRangePicker = createComponent<DateRangePickerProps>(
  () => getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.DateRangePicker,
);
