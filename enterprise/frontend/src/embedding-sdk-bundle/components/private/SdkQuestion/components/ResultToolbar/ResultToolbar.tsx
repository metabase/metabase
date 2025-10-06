import type { PropsWithChildren } from "react";

import { Group } from "metabase/ui";

type Props = {
  "data-testid"?: string;
};

export const ResultToolbar = ({
  children,
  "data-testid": dataTestId,
}: PropsWithChildren<Props>) => (
  <Group
    justify="space-between"
    p="sm"
    bg="var(--mb-color-bg-sdk-question-toolbar)"
    style={{ borderRadius: "0.5rem" }}
    data-testid={dataTestId}
  >
    {children}
  </Group>
);
