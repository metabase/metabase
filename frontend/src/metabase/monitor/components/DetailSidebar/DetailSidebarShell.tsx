import type { ReactNode } from "react";

import { Flex, Stack } from "metabase/ui";

import S from "./DetailSidebarShell.module.css";

type DetailSidebarShellProps = {
  /** The scrolling contents: the header and the sections below it. */
  children: ReactNode;
  /** The actions pinned below them, outside the scroll. */
  footer?: ReactNode;
  "data-testid"?: string;
};

/** The frame every Monitor detail sidebar shares: a scrolling body with the actions pinned beneath it. */
export const DetailSidebarShell = ({
  children,
  footer,
  "data-testid": dataTestId,
}: DetailSidebarShellProps) => (
  <Flex
    direction="column"
    h="100%"
    flex="1 1 auto"
    miw={0}
    className={S.shell}
    bg="background_page-primary"
    data-testid={dataTestId}
  >
    <Stack flex="1 1 auto" mih={0} p="xl" gap="xl" className={S.body}>
      {children}
    </Stack>
    {footer}
  </Flex>
);
