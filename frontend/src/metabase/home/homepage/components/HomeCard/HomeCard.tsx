import React, { ReactNode } from "react";
import { CardRoot } from "./HomeCard.styled";

export interface HomeCardProps {
  className?: string;
  url?: string;
  primary?: boolean;
  secondary?: boolean;
  children?: ReactNode;
}

const HomeCard = ({
  className,
  url = "",
  primary,
  secondary,
  children,
}: HomeCardProps): JSX.Element => {
  return (
    <CardRoot
      className={className}
      to={url}
      primary={primary}
      secondary={secondary}
    >
      {children}
    </CardRoot>
  );
};

export default HomeCard;
