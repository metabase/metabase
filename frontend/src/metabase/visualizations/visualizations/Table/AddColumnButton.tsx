import type { HTMLAttributes } from "react";
import { t } from "ttag";

import { Button, Icon } from "metabase/ui";

interface AddColumnButtonProps extends HTMLAttributes<HTMLButtonElement> {
  headerHeight: number;
  pageWidth: number;
  tableContentWidth?: number;
}

export const AddColumnButton = ({
  headerHeight,
  pageWidth,
  tableContentWidth,
  onClick,
}: AddColumnButtonProps) => {
  if (!tableContentWidth) {
    return null;
  }

  const isOverflowing = tableContentWidth > pageWidth;

  if (!tableContentWidth) {
    return null;
  }
  return (
    <div
      style={{
        position: "absolute",
        height: headerHeight,
        width: headerHeight,
        top: 0,
        left: isOverflowing ? undefined : tableContentWidth,
        right: isOverflowing ? 0 : undefined,
      }}
    >
      <Button
        variant="outline"
        compact
        leftIcon={<Icon name="add" />}
        title={t`Add column`}
        aria-label={t`Add column`}
        onClick={onClick}
      />
    </div>
  );
};
