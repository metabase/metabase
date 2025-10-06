import type { ReactNode } from "react";

import { Title } from "metabase/ui";

interface Props {
  children: ReactNode;
  color?: string;
}

export const VariationDetails = ({ children, color }: Props) => {
  if (!children) {
    return null;
  }

  return (
    <Title c={color} order={5}>
      {children}
    </Title>
  );
};
