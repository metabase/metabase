import type { PropsWithChildren } from "react";
import { t } from "ttag";

import Tooltip, {
  TooltipContainer,
  TooltipTitle,
  TooltipSubtitle,
} from "metabase/core/components/Tooltip";
import {
  MAX_UPLOAD_STRING,
  UPLOAD_DATA_FILE_TYPES,
} from "metabase/redux/uploads";
import type { Collection } from "metabase-types/api";

export const UploadTooltip = ({
  collection,
  children,
}: PropsWithChildren<{
  collection: Collection;
}>) => (
  <Tooltip
    tooltip={
      <TooltipContainer>
        <TooltipTitle>{t`Upload data to ${collection.name}`}</TooltipTitle>
        <TooltipSubtitle>{t`${UPLOAD_DATA_FILE_TYPES.join(
          ", ",
        )} (${MAX_UPLOAD_STRING} MB max)`}</TooltipSubtitle>
      </TooltipContainer>
    }
    placement="bottom"
  >
    {children}
  </Tooltip>
);
