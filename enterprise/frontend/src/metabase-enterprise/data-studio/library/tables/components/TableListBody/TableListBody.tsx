import type { ReactNode } from "react";

import { Flex, Stack } from "metabase/ui";

import S from "./TableListBody.module.css";

/**
 * The area below a table's tabs: full width, with the header's 3.5rem (56px)
 * at each side. White with a divider, or the page's own background.
 */
export function TableListBody({
  hasPageBackground = false,
  children,
}: {
  /** The secondary page background and no divider, like the Data page */
  hasPageBackground?: boolean;
  children: ReactNode;
}) {
  return (
    <Flex className={hasPageBackground ? S.pageBody : S.body} flex={1}>
      <Stack className={S.column} flex={1} mih={0} py="xl">
        {children}
      </Stack>
    </Flex>
  );
}
