import type { ReactNode } from "react";

import type { ColorName } from "metabase/lib/colors/types";
import { Title } from "metabase/ui";

interface Props {
  children: ReactNode;
  color?: ColorName;
}

export const VariationDetails = ({ children, color }: Props) => {
  if (!children) {
    return null;
  }

  return (
    <Title c={color} order={5} lh="inherit">
      {children}
    </Title>
  );
};
