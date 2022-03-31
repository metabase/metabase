import React, { ReactNode } from "react";
import { CardRoot } from "./HomeCard.styled";

export interface HomeCardProps {
  className?: string;
  url?: string;
  children?: ReactNode;
}

const HomeCard = ({
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

export default HomeCard;
