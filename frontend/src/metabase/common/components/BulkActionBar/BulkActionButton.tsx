import { forwardRef } from "react";

import { Button, type ButtonProps } from "metabase/ui";

type BulkActionButtonProps = Omit<ButtonProps, "variant" | "c"> & {
  danger?: boolean;
};

export const BulkActionButton = forwardRef<
  HTMLButtonElement,
  BulkActionButtonProps
>(function BulkActionButton({ danger = false, color, ...props }, ref) {
  return (
    <Button
      {...props}
      ref={ref}
      variant="on-dark-secondary"
      color={danger ? "negative" : color}
    />
  );
});
