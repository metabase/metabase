import { type HTMLAttributes, type PropsWithChildren, forwardRef } from "react";

import { Group } from "metabase/ui";

type Props = HTMLAttributes<HTMLDivElement> & {
  "data-testid"?: string;
};

export const ResultToolbar = forwardRef<
  HTMLDivElement,
  PropsWithChildren<Props>
>(function ResultToolbar(
  { children, "data-testid": dataTestId, ...divProps },
  ref,
) {
  return (
    <Group
      ref={ref}
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
});
