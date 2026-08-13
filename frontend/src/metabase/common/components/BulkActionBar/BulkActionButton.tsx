import cx from "classnames";
import { forwardRef } from "react";

import { Button, type ButtonProps } from "metabase/ui";

import S from "./BulkActionBar.module.css";

type BulkActionButtonProps = ButtonProps & {
  classname?: string;
};

export const BulkActionButton = forwardRef<
  HTMLButtonElement,
  BulkActionButtonProps
>(function BulkActionButton({ classname, ...props }, ref) {
  return (
    <Button
      ref={ref}
      className={cx(S.BulkActionButton, classname)}
      {...props}
    />
  );
});

export const BulkActionDangerButton = ({
  classname,
  ...props
}: BulkActionButtonProps) => (
  <Button
    className={cx(S.BulkActionButton, S.BulkActionDangerButton, classname)}
    {...props}
  />
);
