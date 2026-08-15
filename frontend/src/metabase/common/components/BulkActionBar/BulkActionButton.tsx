import cx from "classnames";
import { forwardRef } from "react";

import { Button, type ButtonProps } from "metabase/ui";

import S from "./BulkActionBar.module.css";

type BulkActionButtonProps = Omit<ButtonProps, "variant"> & {
  danger?: boolean;
};

export const BulkActionButton = forwardRef<
  HTMLButtonElement,
  BulkActionButtonProps
>(function BulkActionButton({ className, danger = false, ...props }, ref) {
  return (
    <Button
      {...props}
      ref={ref}
      variant="transparent"
      classNames={{
        root: cx(
          S.BulkActionButton,
          {
            [S.BulkActionDangerButton]: danger,
          },
          className,
        ),
        label: S.BulkActionButtonLabel,
      }}
    />
  );
});
