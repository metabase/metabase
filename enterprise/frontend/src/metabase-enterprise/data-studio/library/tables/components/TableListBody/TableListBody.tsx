import type { ReactNode } from "react";

import { Flex, Stack } from "metabase/ui";

import S from "./TableListBody.module.css";

/**
 * The white area below a table's tabs for its Segments and Measures lists:
 * full width, with the header's 3.5rem (56px) at each side
 */
export function TableListBody({ children }: { children: ReactNode }) {
  return (
    <Flex className={S.body} flex={1}>
      <Stack className={S.column} flex={1} mih={0} py="xl">
        {children}
      </Stack>
    </Flex>
  );
}
