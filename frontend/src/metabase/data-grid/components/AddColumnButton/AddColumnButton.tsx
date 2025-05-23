import cx from "classnames";
import { type HTMLAttributes, memo } from "react";
import { t } from "ttag";

import { Button, Icon } from "metabase/ui";

import S from "./AddColumnButton.module.css";

interface AddColumnButtonProps extends HTMLAttributes<HTMLButtonElement> {
  isSticky?: boolean;
  marginRight?: number;
}

export const AddColumnButton = memo(function AddColumnButton({
  isSticky,
  marginRight,
  onClick,
}: AddColumnButtonProps) {
  return (
    <div
      className={cx(S.root, { [S.sticky]: isSticky })}
      style={{ marginRight }}
    >
      <Button
        className={S.button}
        variant="subtle"
        size="compact-md"
        w={23}
        h={23}
        leftSection={<Icon name="add" />}
        title={t`Add column`}
        aria-label={t`Add column`}
        onClick={onClick}
      />
    </div>
  );
});
