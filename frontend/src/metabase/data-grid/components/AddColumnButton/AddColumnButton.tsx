import cx from "classnames";
import { type HTMLAttributes, memo } from "react";
import { t } from "ttag";

import { Button, Icon } from "metabase/ui";

import S from "./AddColumnButton.module.css";

interface AddColumnButtonProps extends HTMLAttributes<HTMLButtonElement> {
  isOverflowing?: boolean;
}

export const AddColumnButton = memo(function AddColumnButton({
  isOverflowing,
  onClick,
}: AddColumnButtonProps) {
  return (
    <div className={cx(S.root, { [S.sticky]: isOverflowing })}>
      <Button
        variant="outline"
        size="compact-md"
        leftSection={<Icon name="add" />}
        title={t`Add column`}
        aria-label={t`Add column`}
        onClick={onClick}
      />
    </div>
  );
});
