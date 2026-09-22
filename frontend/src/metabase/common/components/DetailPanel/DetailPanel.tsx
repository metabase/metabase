import type { ReactNode } from "react";

import { Box, Card, Group, Text } from "metabase/ui";

import S from "./DetailPanel.module.css";

export type DetailPanelProps = {
  title: string;
  /** Right side of the title row: a single link or button out to the full editor/view. */
  actions?: ReactNode;
  /** Drop body padding. Tables and the embedded graph draw their own. */
  flush?: boolean;
  children: ReactNode;
  "data-testid"?: string;
};

export function DetailPanel({
  title,
  actions,
  flush,
  children,
  "data-testid": dataTestId,
}: DetailPanelProps) {
  return (
    <Card withBorder shadow="none" p={0} data-testid={dataTestId}>
      <Group
        justify="space-between"
        align="center"
        px="lg"
        py="sm"
        className={S.header}
      >
        <Text fw="bold" size="sm">
          {title}
        </Text>
        {actions}
      </Group>
      <Box p={flush ? 0 : "lg"}>{children}</Box>
    </Card>
  );
}
