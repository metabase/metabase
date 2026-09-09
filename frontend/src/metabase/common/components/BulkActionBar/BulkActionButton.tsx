import { forwardRef } from "react";

import { Button, type ButtonProps } from "metabase/ui";

type BulkActionButtonProps = Omit<ButtonProps, "variant"> & {
  danger?: boolean;
};

export const BulkActionButton = forwardRef<
  HTMLButtonElement,
  BulkActionButtonProps
>(function BulkActionButton({ danger = false, c, ...props }, ref) {
  return (
    <Button
      {...props}
      ref={ref}
      variant="on-dark-secondary"
      c={danger ? "feedback-negative" : c}
    />
  );
});
