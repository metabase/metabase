import type { PropsWithChildren } from "react";

import { Group } from "metabase/ui";

type Props = {
  className?: string;
  "data-testid"?: string;
};

export const ResultToolbar = ({
  children,
  "data-testid": dataTestId,
  className,
}: PropsWithChildren<Props>) => (
  <Group
    className={className}
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
