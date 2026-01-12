import cx from "classnames";

import { Button, type ButtonProps } from "metabase/ui";

import S from "./BulkActionBar.module.css";

type BulkActionButtonProps = ButtonProps & {
  classname?: string;
};

export const BulkActionButton = ({
  classname,
  ...props
}: BulkActionButtonProps) => (
  <Button className={cx(S.BulkActionButton, classname)} {...props} />
);

export const BulkActionDangerButton = ({
  classname,
  ...props
}: BulkActionButtonProps) => (
  <Button
    className={cx(S.BulkActionButton, S.BulkActionDangerButton, classname)}
    {...props}
  />
);
