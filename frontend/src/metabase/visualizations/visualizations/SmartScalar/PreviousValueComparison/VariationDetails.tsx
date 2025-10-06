import type { ReactNode } from "react";

import { Title } from "metabase/ui";

interface Props {
  children: ReactNode;
  color: string;
  separatorColor: string;
}

export const VariationDetails = ({ children, color }: Props) => {
  if (!children) {
    return null;
  }

  return (
    <Title c={color} order={5} style={{ whiteSpace: "pre" }}>
      {children}
    </Title>
  );
};
