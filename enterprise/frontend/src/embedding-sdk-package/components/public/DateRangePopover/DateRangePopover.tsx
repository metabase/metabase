import type { DateRangePopoverProps } from "embedding-sdk-bundle/components/public/DateRangePopover/DateRangePopover";
import { createComponent } from "embedding-sdk-package/components/private/ComponentWrapper/ComponentWrapper";
import { getWindow } from "embedding-sdk-shared/lib/get-window";

export const DateRangePopover = createComponent<DateRangePopoverProps>(
  () => getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.DateRangePopover,
);
