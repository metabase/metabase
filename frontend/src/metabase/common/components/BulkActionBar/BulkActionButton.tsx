import { forwardRef } from "react";

import { Button, type ButtonProps } from "metabase/ui";

type BulkActionButtonProps = Omit<ButtonProps, "variant"> & {
  danger?: boolean;
};

export const BulkActionButton = forwardRef<
  HTMLButtonElement,
  BulkActionButtonProps
>(function BulkActionButton({ danger = false, c, disabled, ...props }, ref) {
  return (
    <Button
      {...props}
      ref={ref}
      disabled={disabled}
      variant="on-dark-secondary"
      c={danger && !disabled ? "feedback-negative" : c}
    />
  );
});
