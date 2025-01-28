import cx from "classnames";
import type { HTMLAttributes } from "react";
import { t } from "ttag";

import { Button, Icon } from "metabase/ui";

import S from "./AddColumnButton.module.css";

interface AddColumnButtonProps extends HTMLAttributes<HTMLButtonElement> {
  headerHeight: number;
  isOverflowing?: boolean;
}

export const AddColumnButton = ({
  headerHeight,
  isOverflowing,
  onClick,
}: AddColumnButtonProps) => {
  return (
    <div
      className={cx(S.root, { [S.sticky]: isOverflowing })}
      style={{
        height: headerHeight,
        width: headerHeight,
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
