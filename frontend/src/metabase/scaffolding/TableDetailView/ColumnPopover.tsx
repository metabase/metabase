import type { ReactNode } from "react";
import { t } from "ttag";

import {
  QueryColumnInfoPopover,
  type QueryColumnInfoPopoverProps,
} from "metabase/common/components/MetadataInfo/ColumnInfoPopover";
import { Box } from "metabase/ui";

type QueryColumnInfoIconProps = QueryColumnInfoPopoverProps & {
  children?: ReactNode;
};

export function ColumnPopover({
  children,
  ...props
}: QueryColumnInfoIconProps) {
  return (
    <>
      <QueryColumnInfoPopover {...props}>
        <Box flex={1} aria-label={t`More info`}>
          {children}
        </Box>
      </QueryColumnInfoPopover>
    </>
  );
}
