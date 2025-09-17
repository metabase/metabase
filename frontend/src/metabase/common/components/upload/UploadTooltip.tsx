import type { PropsWithChildren } from "react";
import { t } from "ttag";

import {
  MAX_UPLOAD_STRING,
  UPLOAD_DATA_FILE_TYPES,
} from "metabase/redux/uploads";
import { Box, Text, Tooltip } from "metabase/ui";
import type { Collection } from "metabase-types/api";

export const UploadTooltip = ({
  collection,
  children,
}: PropsWithChildren<{
  collection: Collection;
}>) => (
  <Tooltip
    label={
      <Box ta="center">
        <Text
          size="sm"
          c="var(--mb-color-text-white)"
        >{t`Upload data to ${collection.name}`}</Text>
        <Text
          size="sm"
          c="var(--mb-color-text-tertiary)"
        >{t`${UPLOAD_DATA_FILE_TYPES.join(
          ", ",
        )} (${MAX_UPLOAD_STRING} MB max)`}</Text>
      </Box>
    }
    position="bottom"
  >
    <span>{children}</span>
  </Tooltip>
);
