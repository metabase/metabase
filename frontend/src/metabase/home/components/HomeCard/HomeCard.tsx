import type { ReactNode } from "react";

import { CardRoot } from "./HomeCard.styled";

interface HomeCardProps {
  className?: string;
  url?: string;
  external?: boolean;
  children?: ReactNode;
  onClick?: () => void;
}

export const HomeCard = ({
  className,
  url = "",
  children,
  onClick,
}: HomeCardProps): JSX.Element => {
  return (
    <CardRoot className={className} to={url} onClick={onClick}>
      {children}
    </CardRoot>
  );
};
