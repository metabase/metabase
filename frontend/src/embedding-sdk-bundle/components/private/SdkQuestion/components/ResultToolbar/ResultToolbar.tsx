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
    style={{
      borderRadius: "0.5rem",
      backgroundColor: "var(--mb-color-bg-sdk-question-toolbar)",
    }}
    data-testid={dataTestId}
  >
    {children}
  </Group>
);
