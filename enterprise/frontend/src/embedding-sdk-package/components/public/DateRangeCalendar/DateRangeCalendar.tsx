import type { DateRangeCalendarProps } from "embedding-sdk-bundle/components/public/DateRangeCalendar/DateRangeCalendar";
import { createComponent } from "embedding-sdk-package/components/private/ComponentWrapper/ComponentWrapper";
import { getWindow } from "embedding-sdk-shared/lib/get-window";

export const DateRangeCalendar = createComponent<DateRangeCalendarProps>(
  () => getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.DateRangeCalendar,
);
