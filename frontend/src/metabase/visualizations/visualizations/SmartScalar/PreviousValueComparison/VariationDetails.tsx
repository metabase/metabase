import type { ReactNode } from "react";

import { Title } from "metabase/ui";

import { Separator } from "./Separator";

interface Props {
  children: ReactNode;
  color: string;
  separatorColor: string;
}

export const VariationDetails = ({
  children,
  color,
  separatorColor,
}: Props) => {
  if (!children) {
    return null;
  }

  return (
    <Title c={color} order={5} style={{ whiteSpace: "pre" }}>
      <Separator color={separatorColor} />
      {children}
    </Title>
  );
};
