import cx from "classnames";
import { t } from "ttag";

import { Button, Icon } from "metabase/ui";

import TableS from "./TableInteractive.module.css";
import { HEADER_HEIGHT } from "./constants";

export const COLUMN_SHORTCUT_PADDING = 4;

interface ColumnShortcutProps {
  height: number;
  pageWidth: number;
  totalWidth: number;
  onClick: () => void;
}

export function ColumnShortcut({
  height,
  pageWidth,
  totalWidth,
  onClick,
}: ColumnShortcutProps) {
  if (!totalWidth) {
    return null;
  }

  const isOverflowing = totalWidth > pageWidth;
  const width = HEADER_HEIGHT + (isOverflowing ? COLUMN_SHORTCUT_PADDING : 0);

  return (
    <div
      className={cx(
        TableS.shortcutsWrapper,
        isOverflowing && TableS.isOverflowing,
      )}
      style={{
        height,
        width,
        left: isOverflowing ? undefined : totalWidth,
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
}
