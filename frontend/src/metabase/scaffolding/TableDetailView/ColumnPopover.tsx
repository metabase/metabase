import type { ReactNode } from "react";
import { t } from "ttag";

import {
  QueryColumnInfoPopover,
  type QueryColumnInfoPopoverProps,
} from "metabase/common/components/MetadataInfo/ColumnInfoPopover";

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
        <div aria-label={t`More info`}>{children}</div>
      </QueryColumnInfoPopover>
    </>
  );
}
