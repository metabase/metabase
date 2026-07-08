import type { ReactNode } from "react";

import { Text, type TextProps } from "metabase/ui";

type SubheadProps = TextProps & {
  children?: ReactNode;
};

export const Subhead = ({ children, ...props }: SubheadProps) => (
  <Text lh="normal" c="text-primary" fz="18px" fw={700} {...props}>
    {children}
  </Text>
);
