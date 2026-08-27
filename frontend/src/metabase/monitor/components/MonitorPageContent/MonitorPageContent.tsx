import cx from "classnames";
import type { ReactNode } from "react";

import { Box, type BoxProps, Stack } from "metabase/ui";

import S from "./MonitorPageContent.module.css";

type MonitorPageContentProps = {
  children?: ReactNode;
} & BoxProps;

export function MonitorPageContent({
  children,
  ...boxProps
}: MonitorPageContentProps) {
  return (
    <Box
      {...boxProps}
      className={cx(S.MonitorPageWrapper, boxProps?.className)}
    >
      <Stack gap="lg" className={S.MonitorPageContent}>
        {children}
      </Stack>
    </Box>
  );
}
