import cx from "classnames";
import type { ReactNode } from "react";

import { Paper, Stack, rem } from "metabase/ui";

import S from "./MetadataCard.module.css";

interface MetadataCardProps {
  children: ReactNode;
  /**
   * Draws a line linking the rows' icons, for rows that form a chain such as
   * a source's database, table, and question. Turn it off for plain lists.
   */
  withConnector?: boolean;
}

export function MetadataCard({
  children,
  withConnector = true,
}: MetadataCardProps) {
  return (
    <Paper className={S.card}>
      <Stack
        gap={rem(12)}
        className={cx(S.rows, { [S.connected]: withConnector })}
      >
        {children}
      </Stack>
    </Paper>
  );
}
