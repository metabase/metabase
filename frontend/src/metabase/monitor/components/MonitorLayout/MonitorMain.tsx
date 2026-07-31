import cx from "classnames";
import type { ReactNode } from "react";

import { Stack, type StackProps } from "metabase/ui";

import S from "./MonitorMain.module.css";

type MonitorMainProps = {
  children?: ReactNode;
} & StackProps;

/**
 * The main content column of a Monitor view: fills the available space and
 * clips overflowing children, so tables can scroll internally.
 */
export function MonitorMain({
  children,
  className,
  ...stackProps
}: MonitorMainProps) {
  return (
    <Stack className={cx(S.main, className)} flex={1} gap="md" {...stackProps}>
      {children}
    </Stack>
  );
}
