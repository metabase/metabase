import React, { ReactNode } from "react";
import { CardRoot } from "./HomeCard.styled";

export interface HomeCardProps {
  className?: string;
  url?: string;
  external?: boolean;
  children?: ReactNode;
  isExternal?: boolean;
}

const HomeCard = ({
  className,
  url = "",
  children,
  isExternal,
}: HomeCardProps): JSX.Element => {
  return (
    <CardRoot className={className} to={url} isExternal={isExternal}>
      {children}
    </CardRoot>
  );
};

export default HomeCard;
