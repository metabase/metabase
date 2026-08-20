import type { ReactNode } from "react";

import { Card } from "metabase/ui";

type MonitorTableCardProps = {
  children: ReactNode;
  "aria-busy"?: boolean;
  "data-testid": string;
};

export const MonitorTableCard = ({
  children,
  "aria-busy": ariaBusy,
  "data-testid": dataTestId,
}: MonitorTableCardProps) => (
  <Card
    flex="0 1 auto"
    mih={0}
    p={0}
    pos="relative"
    withBorder
    aria-busy={ariaBusy}
    data-testid={dataTestId}
  >
    {children}
  </Card>
);
