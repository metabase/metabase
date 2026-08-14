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
>(function BulkActionButton({ classname, className, ...props }, ref) {
  // className is merged after the spread so wrappers that clone this element
  // with their own className (e.g. Menu.Target) can't wipe the bar styling
  return (
    <Button
      ref={ref}
      {...props}
      className={cx(S.BulkActionButton, classname, className)}
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
