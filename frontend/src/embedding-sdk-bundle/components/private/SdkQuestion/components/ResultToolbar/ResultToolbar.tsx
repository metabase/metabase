import type { HTMLAttributes, PropsWithChildren } from "react";

import { Group } from "metabase/ui";

type Props = HTMLAttributes<HTMLDivElement> & {
  "data-testid"?: string;
};

export const ResultToolbar = ({
  children,
  "data-testid": dataTestId,
  ...divProps
}: PropsWithChildren<Props>) => (
  <Group
    p="sm"
    style={{
      borderRadius: "0.5rem",
      backgroundColor: "var(--mb-color-bg-sdk-question-toolbar)",
    }}
    data-testid={dataTestId}
    {...divProps}
  >
    {children}
  </Group>
);
