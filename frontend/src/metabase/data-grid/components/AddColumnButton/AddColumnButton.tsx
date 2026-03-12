import cx from "classnames";
import { type HTMLAttributes, memo } from "react";
import { t } from "ttag";

import { Button, Icon } from "metabase/ui";

import S from "./AddColumnButton.module.css";

interface AddColumnButtonProps extends HTMLAttributes<HTMLButtonElement> {
  isSticky?: boolean;
}

export const AddColumnButton = memo(function AddColumnButton({
  isSticky,
  onClick,
}: AddColumnButtonProps) {
  return (
    <div className={cx(S.root, { [S.sticky]: isSticky })}>
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
