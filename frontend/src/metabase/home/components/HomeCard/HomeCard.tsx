import type { ReactNode } from "react";

import { CardRoot } from "./HomeCard.styled";

interface HomeCardProps {
  className?: string;
  url?: string;
  external?: boolean;
  children?: ReactNode;
}

export const HomeCard = ({
  className,
  url = "",
  children,
}: HomeCardProps): JSX.Element => {
  return (
    <CardRoot className={className} to={url}>
      {children}
    </CardRoot>
  );
};
