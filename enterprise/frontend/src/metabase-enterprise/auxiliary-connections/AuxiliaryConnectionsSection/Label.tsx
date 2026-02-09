import type { ReactNode } from "react";

import { Text } from "metabase/ui";

export function Label({
  htmlFor,
  children,
}: {
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <Text component="label" fw="bold" htmlFor={htmlFor}>
      {children}
    </Text>
  );
}
