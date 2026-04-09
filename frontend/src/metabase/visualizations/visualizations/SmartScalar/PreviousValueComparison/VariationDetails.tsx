import type { ReactNode } from "react";

import { Title } from "metabase/ui";
import type { ColorName } from "metabase/ui/colors/types";

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
