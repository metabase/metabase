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
        className={cx(S.BulkActionButton, className)}
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
    classNames={{
      label: S.BulkActionButtonLabel,
    }}
  />
);
