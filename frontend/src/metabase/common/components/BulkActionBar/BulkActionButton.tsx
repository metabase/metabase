import cx from "classnames";
import { forwardRef } from "react";

import { Button, type ButtonProps } from "metabase/ui";

import S from "./BulkActionBar.module.css";

export const BulkActionButton = forwardRef<HTMLButtonElement, ButtonProps>(
  function BulkActionButton({ className, ...props }, ref) {
    return (
      <Button
        {...props}
        ref={ref}
        classNames={{
          root: cx(S.BulkActionButton, className),
          label: S.BulkActionButtonLabel,
        }}
      />
    );
  },
);

export const BulkActionDangerButton = ({
  className,
  ...props
}: ButtonProps) => (
  <Button
    {...props}
    className={cx(S.BulkActionButton, S.BulkActionDangerButton, className)}
  />
);
