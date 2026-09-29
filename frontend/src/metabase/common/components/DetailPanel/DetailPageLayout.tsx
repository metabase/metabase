import type { ReactNode } from "react";

import { Box, Flex, Stack } from "metabase/ui";

import S from "./DetailPageLayout.module.css";

export type DetailPageLayoutProps = {
  /** Sticky right-hand fact rail. */
  rail: ReactNode;
  children: ReactNode;
};

export function DetailPageLayout({ rail, children }: DetailPageLayoutProps) {
  return (
    <Flex align="flex-start" gap="lg">
      <Stack flex={1} miw={0} gap="lg">
        {children}
      </Stack>
      <Box className={S.rail} flex="0 0 20rem" w="20rem">
        {rail}
      </Box>
    </Flex>
  );
}
